"""
Reader module for IMD gridded binary (.grd) files and ISRO/INSAT satellite NetCDF files.
Converts raw binary grids to xarray Datasets with standardized spatio-temporal coordinates.
"""
import calendar
import numpy as np
import pandas as pd
import xarray as xr
from pathlib import Path
from typing import Dict, Optional, Tuple

import sys
sys.path.append(str(Path(__file__).resolve().parent.parent))
import config

# IMD Grid Specifications
RF_NLAT = 129
RF_NLON = 135
RF_LATS = np.linspace(6.5, 38.5, RF_NLAT)    # 0.25 deg increment
RF_LONS = np.linspace(66.5, 100.0, RF_NLON)  # 0.25 deg increment
RF_NODATA = -999.0

TEMP_NLAT = 31
TEMP_NLON = 31
TEMP_LATS = np.linspace(7.5, 37.5, TEMP_NLAT)  # 1.0 deg increment
TEMP_LONS = np.linspace(67.5, 97.5, TEMP_NLON)  # 1.0 deg increment
TEMP_NODATA = 99.9


def read_imd_rainfall_year(year: int, file_path: Path) -> xr.DataArray:
    """
    Reads a single year IMD 0.25x0.25 gridded rainfall binary (.grd) file.
    Grid format: 135 (lon) x 129 (lat), float32.
    """
    num_days = 366 if calendar.isleap(year) else 365
    raw_data = np.fromfile(file_path, dtype=np.float32)
    expected_size = num_days * RF_NLAT * RF_NLON
    
    if raw_data.size != expected_size:
        raise ValueError(f"File {file_path} size {raw_data.size} does not match expected {expected_size}")
    
    # Reshape to (days, lat, lon)
    grid = raw_data.reshape((num_days, RF_NLAT, RF_NLON))
    # Mask no-data (-999.0) and negative values
    grid = np.where((grid == RF_NODATA) | (grid < 0), np.nan, grid)
    
    dates = pd.date_range(start=f"{year}-01-01", periods=num_days, freq="D")
    
    da = xr.DataArray(
        grid,
        coords=[("time", dates), ("lat", RF_LATS), ("lon", RF_LONS)],
        name="rainfall",
        attrs={"units": "mm/day", "long_name": "Daily Gridded Rainfall", "source": "IMD 0.25x0.25"}
    )
    return da


def read_imd_temperature_year(year: int, file_path: Path, var_name: str = "tmax") -> xr.DataArray:
    """
    Reads a single year IMD 1.0x1.0 gridded temperature binary (.GRD) file (Tmax or Tmin).
    Grid format: 31 (lon) x 31 (lat), float32.
    """
    num_days = 366 if calendar.isleap(year) else 365
    raw_data = np.fromfile(file_path, dtype=np.float32)
    expected_size = num_days * TEMP_NLAT * TEMP_NLON
    
    if raw_data.size != expected_size:
        raise ValueError(f"File {file_path} size {raw_data.size} does not match expected {expected_size}")
    
    # Reshape to (days, lat, lon)
    grid = raw_data.reshape((num_days, TEMP_NLAT, TEMP_NLON))
    # Mask no-data (99.9 or > 90.0)
    grid = np.where((grid == TEMP_NODATA) | (grid > 90.0) | (grid < -50.0), np.nan, grid)
    
    dates = pd.date_range(start=f"{year}-01-01", periods=num_days, freq="D")
    
    da = xr.DataArray(
        grid,
        coords=[("time", dates), ("lat", TEMP_LATS), ("lon", TEMP_LONS)],
        name=var_name,
        attrs={"units": "deg C", "long_name": f"Daily Gridded {var_name.upper()}", "source": "IMD 1.0x1.0"}
    )
    return da


def load_all_imd_data(
    start_year: int = config.START_YEAR,
    end_year: int = config.END_YEAR
) -> Tuple[xr.DataArray, xr.DataArray, xr.DataArray]:
    """
    Loads all IMD rainfall, tmax, and tmin years from 2010 to 2025 and concatenates along time.
    """
    rf_list = []
    tmax_list = []
    tmin_list = []
    
    print(f"Loading IMD climate grids from {start_year} to {end_year}...")
    
    for yr in range(start_year, end_year + 1):
        # Rainfall file
        rf_file = config.RAINFALL_DIR / f"Rainfall_ind{yr}_rfp25.grd"
        if not rf_file.exists():
            # Try case-insensitive matching
            matches = list(config.RAINFALL_DIR.glob(f"*{yr}*.grd"))
            if matches:
                rf_file = matches[0]
            else:
                raise FileNotFoundError(f"Missing rainfall file for year {yr} in {config.RAINFALL_DIR}")
        
        # Tmax file
        tmax_file = config.TMAX_DIR / f"Maxtemp_MaxT_{yr}.GRD"
        if not tmax_file.exists():
            matches = list(config.TMAX_DIR.glob(f"*{yr}*.GRD")) + list(config.TMAX_DIR.glob(f"*{yr}*.grd"))
            if matches:
                tmax_file = matches[0]
            else:
                raise FileNotFoundError(f"Missing Tmax file for year {yr} in {config.TMAX_DIR}")
                
        # Tmin file
        tmin_file = config.TMIN_DIR / f"Mintemp_MinT_{yr}.GRD"
        if not tmin_file.exists():
            matches = list(config.TMIN_DIR.glob(f"*{yr}*.GRD")) + list(config.TMIN_DIR.glob(f"*{yr}*.grd"))
            if matches:
                tmin_file = matches[0]
            else:
                raise FileNotFoundError(f"Missing Tmin file for year {yr} in {config.TMIN_DIR}")
                
        rf_da = read_imd_rainfall_year(yr, rf_file)
        tmax_da = read_imd_temperature_year(yr, tmax_file, "tmax")
        tmin_da = read_imd_temperature_year(yr, tmin_file, "tmin")
        
        rf_list.append(rf_da)
        tmax_list.append(tmax_da)
        tmin_list.append(tmin_da)
        
    all_rf = xr.concat(rf_list, dim="time")
    all_tmax = xr.concat(tmax_list, dim="time")
    all_tmin = xr.concat(tmin_list, dim="time")
    
    print(f"Loaded {len(all_rf.time)} days of records across all 3 variables.")
    return all_rf, all_tmax, all_tmin


def load_satellite_data(file_path: Optional[Path] = None) -> Optional[xr.Dataset]:
    """
    Extensibility Hook: Loads ISRO/INSAT-3D/3DR satellite data (e.g. OLR, Brightness Temp, NDVI)
    from NetCDF/HDF5 if present.
    """
    if file_path and file_path.exists():
        print(f"Loading satellite data from {file_path}...")
        ds = xr.open_dataset(file_path)
        return ds
    return None
