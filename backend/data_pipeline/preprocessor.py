"""
Preprocessor module for spatiotemporal alignment, spatial regridding, multi-channel fusion,
and normalization of IMD climate variables.
"""
import json
import numpy as np
import pandas as pd
import xarray as xr
from pathlib import Path
from typing import Dict, Tuple, Optional

import sys
sys.path.append(str(Path(__file__).resolve().parent.parent))
import config
from data_pipeline.reader import load_all_imd_data


def align_and_regrid_dataset(
    rf_da: xr.DataArray,
    tmax_da: xr.DataArray,
    tmin_da: xr.DataArray,
    target_height: int = config.GRID_HEIGHT,
    target_width: int = config.GRID_WIDTH,
    lat_min: float = config.LAT_MIN,
    lat_max: float = config.LAT_MAX,
    lon_min: float = config.LON_MIN,
    lon_max: float = config.LON_MAX
) -> xr.Dataset:
    """
    Interpolates and regrids all variables onto a common All-India regular grid.
    Target grid dimensions: (target_height, target_width)
    """
    target_lats = np.linspace(lat_min, lat_max, target_height)
    target_lons = np.linspace(lon_min, lon_max, target_width)
    
    print(f"Regridding variables to common grid ({target_height}x{target_width}) over "
          f"Lat [{lat_min}, {lat_max}], Lon [{lon_min}, {lon_max}]...")
    
    # Bilinear interpolation onto target coordinates
    rf_interp = rf_da.interp(lat=target_lats, lon=target_lons, method="linear")
    tmax_interp = tmax_da.interp(lat=target_lats, lon=target_lons, method="linear")
    tmin_interp = tmin_da.interp(lat=target_lats, lon=target_lons, method="linear")
    
    # Create unified dataset
    ds = xr.Dataset(
        data_vars={
            "rainfall": (("time", "lat", "lon"), rf_interp.values),
            "tmax": (("time", "lat", "lon"), tmax_interp.values),
            "tmin": (("time", "lat", "lon"), tmin_interp.values),
        },
        coords={
            "time": rf_interp.time.values,
            "lat": target_lats,
            "lon": target_lons
        },
        attrs={
            "title": "All-India Fused Climate Grid (Rainfall, Tmax, Tmin)",
            "spatial_resolution": f"{(lat_max - lat_min)/(target_height-1):.3f} deg",
            "source": "India Meteorological Department (IMD)",
        }
    )
    return ds


def get_karnataka_polygon_mask(target_height: int = config.GRID_HEIGHT, target_width: int = config.GRID_WIDTH) -> np.ndarray:
    """
    Computes a precise 32x32 binary mask defining Karnataka state's borders.
    Points inside Karnataka = 1.0, outside (Arabian Sea / other states) = 0.0.
    """
    from matplotlib.path import Path
    poly_pts = [
        (76.69, 11.59), (75.80, 12.00), (75.38, 12.56), (74.85, 12.87), (74.74, 13.34),
        (74.55, 13.97), (74.41, 14.42), (74.13, 14.82), (74.30, 15.65), (74.38, 16.40),
        (75.05, 16.73), (75.96, 17.17), (76.57, 17.56), (77.20, 18.45), (77.55, 18.25),
        (77.28, 17.18), (77.35, 16.20), (76.92, 15.14), (76.75, 14.72), (77.27, 14.10),
        (77.79, 13.78), (78.39, 13.16), (78.19, 12.98), (77.69, 12.71), (77.42, 12.55),
        (77.06, 12.38), (76.95, 11.92), (76.69, 11.59)
    ]
    path = Path(poly_pts)
    lats = np.linspace(config.LAT_MIN, config.LAT_MAX, target_height)
    lons = np.linspace(config.LON_MIN, config.LON_MAX, target_width)
    mask = np.zeros((target_height, target_width), dtype=np.float32)
    for y, lat in enumerate(lats):
        for x, lon in enumerate(lons):
            if path.contains_point((lon, lat)):
                mask[y, x] = 1.0
    return mask


def compute_land_mask(ds: xr.Dataset) -> np.ndarray:
    """
    Computes a 2D boolean land mask (1 for valid land points, 0 for ocean/no-data/outside Karnataka).
    Combines valid IMD observation data with the official Karnataka state boundary polygon.
    """
    valid_counts = (~np.isnan(ds["tmax"].values)).sum(axis=0)
    data_mask = (valid_counts > (0.2 * len(ds.time))).astype(np.float32)
    geo_mask = get_karnataka_polygon_mask(config.GRID_HEIGHT, config.GRID_WIDTH)
    land_mask = (data_mask * geo_mask).astype(np.float32)
    return land_mask


def fill_missing_values(ds: xr.Dataset, land_mask: np.ndarray) -> xr.Dataset:
    """
    Fills NaNs in climate variables:
    - Land points: forward/backward temporal fill + spatial mean fill
    - Ocean points: set to 0.0 (masked out)
    """
    filled_vars = {}
    for var_name in ["rainfall", "tmax", "tmin"]:
        data = ds[var_name].values.copy()
        
        # For rainfall, negative or NaN over land is 0.0 mm
        if var_name == "rainfall":
            data = np.nan_to_num(data, nan=0.0)
            data = np.maximum(data, 0.0)
        else:
            # Temperature: fill NaNs across time with regional mean per day
            mean_over_land = np.nanmean(data, axis=(1, 2), keepdims=True)
            # If all are NaN on a day, fallback to default (e.g. 30C for tmax, 20C for tmin)
            default_val = 32.0 if var_name == "tmax" else 22.0
            mean_over_land = np.nan_to_num(mean_over_land, nan=default_val)
            
            nan_indices = np.isnan(data)
            data[nan_indices] = np.broadcast_to(mean_over_land, data.shape)[nan_indices]
            
            # Mask ocean back to 0.0 for clean network processing
            data = data * land_mask[np.newaxis, :, :]
            
        filled_vars[var_name] = (("time", "lat", "lon"), data)
        
    ds_filled = xr.Dataset(
        data_vars=filled_vars,
        coords=ds.coords,
        attrs=ds.attrs
    )
    return ds_filled


def fit_scalers(ds: xr.Dataset, train_years: list) -> Dict[str, Dict[str, float]]:
    """
    Calculates MinMax normalization statistics strictly from the training years (preventing data leakage).
    """
    train_slice = ds.sel(time=ds.time.dt.year.isin(train_years))
    scalers = {}
    
    for var in config.CHANNELS:
        data = train_slice[var].values
        # For valid positive values
        v_min = float(np.min(data))
        # Use 99.9th percentile for rainfall to avoid extreme single-pixel outliers squashing normal rains
        if var == "rainfall":
            v_max = float(np.percentile(data, 99.9))
            if v_max <= v_min:
                v_max = float(np.max(data))
        else:
            v_max = float(np.max(data))
            
        scalers[var] = {
            "min": v_min,
            "max": v_max,
            "mean": float(np.mean(data)),
            "std": float(np.std(data))
        }
        print(f"Scaler for {var}: Min={v_min:.2f}, Max={v_max:.2f}, Mean={scalers[var]['mean']:.2f}")
        
    # Save scalers to JSON
    with open(config.SCALER_PARAMS_PATH, "w") as f:
        json.dump(scalers, f, indent=2)
    print(f"Saved scaler parameters to {config.SCALER_PARAMS_PATH}")
    return scalers


def normalize_dataset(ds: xr.Dataset, scalers: Dict[str, Dict[str, float]]) -> np.ndarray:
    """
    Normalizes dataset into a 4D numpy array: (time, lat, lon, num_channels) with values in [0, 1].
    """
    num_times = len(ds.time)
    h, w = len(ds.lat), len(ds.lon)
    normalized_array = np.zeros((num_times, h, w, config.NUM_CHANNELS), dtype=np.float32)
    
    for i, var in enumerate(config.CHANNELS):
        data = ds[var].values
        s_min = scalers[var]["min"]
        s_max = scalers[var]["max"]
        
        # Scale to [0, 1]
        norm = (data - s_min) / (s_max - s_min + 1e-8)
        norm = np.clip(norm, 0.0, 1.0)
        normalized_array[:, :, :, i] = norm
        
    return normalized_array


def inverse_transform(
    norm_tensor: np.ndarray,
    scalers: Optional[Dict[str, Dict[str, float]]] = None
) -> np.ndarray:
    """
    Inverse-transforms normalized tensor back to original physical units (mm/day, °C).
    norm_tensor shape: (..., num_channels)
    """
    if scalers is None:
        with open(config.SCALER_PARAMS_PATH, "r") as f:
            scalers = json.load(f)
            
    res = norm_tensor.copy()
    for i, var in enumerate(config.CHANNELS):
        s_min = scalers[var]["min"]
        s_max = scalers[var]["max"]
        res[..., i] = res[..., i] * (s_max - s_min) + s_min
        if var == "rainfall":
            res[..., i] = np.maximum(res[..., i], 0.0)
            
    return res


def prepare_full_pipeline(force_recompute: bool = False) -> Tuple[xr.Dataset, np.ndarray, np.ndarray, Dict]:
    """
    End-to-end data preparation pipeline:
    1. Check for cached NetCDF or load raw binary files
    2. Regrid & Fuse into 32x32 All-India grid
    3. Fill missing values & generate land mask
    4. Compute scalers & normalize into (N, 32, 32, 3) tensor
    """
    if config.NC_COMBINED_PATH.exists() and not force_recompute:
        print(f"Loading cached fused dataset from {config.NC_COMBINED_PATH}...")
        ds_filled = xr.open_dataset(config.NC_COMBINED_PATH)
    else:
        rf_da, tmax_da, tmin_da = load_all_imd_data()
        ds_raw = align_and_regrid_dataset(rf_da, tmax_da, tmin_da)
        land_mask = compute_land_mask(ds_raw)
        ds_filled = fill_missing_values(ds_raw, land_mask)
        
        # Add land mask as coordinate/variable
        ds_filled["land_mask"] = (("lat", "lon"), land_mask)
        print(f"Caching fused dataset to {config.NC_COMBINED_PATH}...")
        ds_filled.to_netcdf(config.NC_COMBINED_PATH)
        
    land_mask = ds_filled["land_mask"].values if "land_mask" in ds_filled else compute_land_mask(ds_filled)
    scalers = fit_scalers(ds_filled, config.TRAIN_YEARS)
    normalized_tensor = normalize_dataset(ds_filled, scalers)
    
    print(f"Prepared normalized tensor shape: {normalized_tensor.shape} (Time, Lat, Lon, Channels)")
    return ds_filled, normalized_tensor, land_mask, scalers
