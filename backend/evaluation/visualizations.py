"""
Visualization generator for the Climate Digital Twin forecasting system:
1. Actual vs Predicted spatial maps (side-by-side)
2. 2D Spatial Error Maps (MAE / RMSE distribution over India)
3. Multi-model baseline comparison charts
4. Forecast horizon lead-time error curves
5. City-level actual vs predicted time series (e.g. Bengaluru, Delhi, Mumbai)
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, Any, List, Optional

import sys
sys.path.append(str(Path(__file__).resolve().parent.parent))
import config
from data_pipeline.preprocessor import inverse_transform

# High-contrast, publication-grade styling
plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")
plt.rcParams.update({
    "font.sans-serif": "Arial",
    "font.size": 10,
    "axes.labelsize": 11,
    "axes.titlesize": 12,
    "figure.titlesize": 14,
    "figure.autolayout": True
})

# City Grid Pixel Coordinates (Scaled to Karnataka 32x32 grid: Lat 11.5-18.5N, Lon 74.0-78.6E)
# lat_idx = (lat - 11.5) / 7.0 * 31
# lon_idx = (lon - 74.0) / 4.6 * 31
CITIES = {
    "Bengaluru (Pilot)": {"lat": 12.97, "lon": 77.59, "y": 7, "x": 24},
    "Mysuru":            {"lat": 12.30, "lon": 76.65, "y": 4, "x": 18},
    "Mangaluru":         {"lat": 12.91, "lon": 74.85, "y": 6, "x": 6},
    "Shivamogga":        {"lat": 13.93, "lon": 75.57, "y": 11, "x": 11},
    "Hubballi-Dharwad":  {"lat": 15.36, "lon": 75.12, "y": 17, "x": 8},
    "Belagavi":          {"lat": 15.85, "lon": 74.50, "y": 19, "x": 3},
    "Kalaburagi":        {"lat": 17.33, "lon": 76.83, "y": 26, "x": 19}
}


def plot_actual_vs_predicted_spatial(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    land_mask: np.ndarray,
    target_date: str,
    lead_day: int = 1,
    save_path: Optional[Path] = None
):
    """
    Generates a 3x3 grid comparison of Actual vs Predicted vs Error across all 3 variables.
    y_true, y_pred shape: (H, W, 3) for a single forecast day in physical units.
    """
    fig, axes = plt.subplots(3, 3, figsize=(15, 12))
    fig.suptitle(f"AI Digital Twin Spatial Forecast (Lead Day +{lead_day}) — Valid for {target_date}", fontsize=16, fontweight="bold")
    
    col_titles = ["Actual (IMD Observation)", "Predicted (ConvLSTM2D)", "Absolute Error (|Pred - Actual|)"]
    for col, title in enumerate(col_titles):
        axes[0, col].set_title(title, fontsize=12, fontweight="bold")
        
    var_configs = [
        {"name": "Rainfall (mm/day)", "idx": 0, "cmap": "Blues", "err_cmap": "YlOrRd", "vmax": 60.0},
        {"name": "Max Temperature (°C)", "idx": 1, "cmap": "YlOrRd", "err_cmap": "Purples", "vmax": 45.0},
        {"name": "Min Temperature (°C)", "idx": 2, "cmap": "coolwarm", "err_cmap": "Purples", "vmax": 30.0},
    ]
    
    lats = np.linspace(config.LAT_MIN, config.LAT_MAX, config.GRID_HEIGHT)
    lons = np.linspace(config.LON_MIN, config.LON_MAX, config.GRID_WIDTH)
    extent = [config.LON_MIN, config.LON_MAX, config.LAT_MIN, config.LAT_MAX]
    
    for row, var_cfg in enumerate(var_configs):
        c = var_cfg["idx"]
        act = y_true[..., c] * land_mask
        pred = y_pred[..., c] * land_mask
        err = np.abs(pred - act) * land_mask
        
        # Mask out 0/ocean for clean plotting
        act_masked = np.ma.masked_where(land_mask == 0, act)
        pred_masked = np.ma.masked_where(land_mask == 0, pred)
        err_masked = np.ma.masked_where(land_mask == 0, err)
        
        # Actual
        im0 = axes[row, 0].imshow(act_masked, origin="lower", extent=extent, cmap=var_cfg["cmap"], vmin=0, vmax=var_cfg["vmax"])
        axes[row, 0].set_ylabel(var_cfg["name"], fontsize=11, fontweight="bold")
        plt.colorbar(im0, ax=axes[row, 0], fraction=0.046, pad=0.04)
        
        # Predicted
        im1 = axes[row, 1].imshow(pred_masked, origin="lower", extent=extent, cmap=var_cfg["cmap"], vmin=0, vmax=var_cfg["vmax"])
        plt.colorbar(im1, ax=axes[row, 1], fraction=0.046, pad=0.04)
        
        # Error
        im2 = axes[row, 2].imshow(err_masked, origin="lower", extent=extent, cmap=var_cfg["err_cmap"])
        plt.colorbar(im2, ax=axes[row, 2], fraction=0.046, pad=0.04)
        
        for ax in axes[row]:
            ax.set_xlabel("Longitude (°E)", fontsize=9)
            ax.grid(True, linestyle="--", alpha=0.3)
            
    if save_path:
        plt.savefig(save_path, dpi=200, bbox_inches="tight")
        print(f"Saved spatial actual vs predicted map to {save_path}")
    plt.close()


def plot_spatial_error_heatmaps(
    spatial_mae_maps: Dict[str, List[List[float]]],
    land_mask: np.ndarray,
    save_path: Optional[Path] = None
):
    """
    Generates 2D spatial MAE error heatmaps across India for each variable.
    """
    fig, axes = plt.subplots(1, 3, figsize=(16, 5))
    fig.suptitle("Spatial Distribution of Mean Absolute Error (MAE) Across India (Test Set)", fontsize=14, fontweight="bold")
    
    extent = [config.LON_MIN, config.LON_MAX, config.LAT_MIN, config.LAT_MAX]
    
    var_meta = [
        {"name": "rainfall", "unit": "mm/day", "cmap": "YlGnBu"},
        {"name": "tmax", "unit": "°C", "cmap": "YlOrRd"},
        {"name": "tmin", "unit": "°C", "cmap": "inferno"},
    ]
    
    for i, meta in enumerate(var_meta):
        var_name = meta["name"]
        raw_map = np.array(spatial_mae_maps[var_name]["MAE_map"])
        masked_map = np.ma.masked_where(land_mask == 0, raw_map)
        
        im = axes[i].imshow(masked_map, origin="lower", extent=extent, cmap=meta["cmap"])
        axes[i].set_title(f"{var_name.upper()} Spatial MAE ({meta['unit']})", fontsize=11, fontweight="bold")
        axes[i].set_xlabel("Longitude (°E)")
        axes[i].set_ylabel("Latitude (°N)")
        plt.colorbar(im, ax=axes[i], fraction=0.046, pad=0.04, label=f"MAE ({meta['unit']})")
        axes[i].grid(True, linestyle="--", alpha=0.3)
        
    if save_path:
        plt.savefig(save_path, dpi=200, bbox_inches="tight")
        print(f"Saved spatial error maps to {save_path}")
    plt.close()


def plot_model_comparison_bar(
    all_metrics: Dict[str, Dict[str, Any]],
    save_path: Optional[Path] = None
):
    """
    Generates benchmark comparison bar charts (ConvLSTM vs Baselines) for MAE, RMSE, and R2.
    """
    models = list(all_metrics.keys())
    vars = ["rainfall", "tmax", "tmin"]
    
    fig, axes = plt.subplots(1, 3, figsize=(16, 5))
    fig.suptitle("Model Benchmark Performance (ConvLSTM2D vs Baselines)", fontsize=14, fontweight="bold")
    
    palette = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"]
    
    for i, var in enumerate(vars):
        mae_vals = [all_metrics[m]["variables"][var]["MAE"] for m in models]
        rmse_vals = [all_metrics[m]["variables"][var]["RMSE"] for m in models]
        r2_vals = [all_metrics[m]["variables"][var]["R2"] for m in models]
        
        x = np.arange(len(models))
        width = 0.25
        
        unit = "mm/day" if var == "rainfall" else "°C"
        axes[i].bar(x - width, mae_vals, width, label="MAE", color="#3b82f6", alpha=0.9)
        axes[i].bar(x, rmse_vals, width, label="RMSE", color="#ef4444", alpha=0.9)
        axes[i].bar(x + width, r2_vals, width, label="R²", color="#10b981", alpha=0.9)
        
        axes[i].set_title(f"{var.upper()} Performance ({unit})", fontsize=11, fontweight="bold")
        axes[i].set_xticks(x)
        axes[i].set_xticklabels(models, rotation=15, ha="right", fontsize=9)
        axes[i].grid(True, linestyle="--", alpha=0.3)
        if i == 0:
            axes[i].legend(loc="upper right")
            
    if save_path:
        plt.savefig(save_path, dpi=200, bbox_inches="tight")
        print(f"Saved benchmark comparison chart to {save_path}")
    plt.close()


def plot_lead_time_degradation(
    lead_time_data: Dict[str, Dict[str, Dict[str, float]]],
    save_path: Optional[Path] = None
):
    """
    Plots error degradation across the 14-day lookahead horizon.
    """
    fig, axes = plt.subplots(1, 3, figsize=(16, 4.5))
    fig.suptitle("Forecast Accuracy Across 14-Day Lookahead Horizon (Lead Time)", fontsize=14, fontweight="bold")
    
    days = [int(k.split("_")[1]) for k in lead_time_data.keys()]
    
    for i, var in enumerate(config.CHANNELS):
        mae_curve = [lead_time_data[f"day_{d}"][var]["MAE"] for d in days]
        rmse_curve = [lead_time_data[f"day_{d}"][var]["RMSE"] for d in days]
        r2_curve = [lead_time_data[f"day_{d}"][var]["R2"] for d in days]
        
        unit = "mm/day" if var == "rainfall" else "°C"
        
        axes[i].plot(days, mae_curve, marker="o", color="#3b82f6", label="MAE", linewidth=2)
        axes[i].plot(days, rmse_curve, marker="s", color="#ef4444", label="RMSE", linewidth=2)
        
        # Dual axis for R2
        ax2 = axes[i].twinx()
        ax2.plot(days, r2_curve, marker="^", color="#10b981", linestyle="--", label="R²", linewidth=2)
        ax2.set_ylabel("R² Score", color="#10b981")
        ax2.grid(False)
        
        axes[i].set_title(f"{var.upper()} ({unit})", fontsize=11, fontweight="bold")
        axes[i].set_xlabel("Lead Time (Days Ahead)")
        axes[i].set_ylabel(f"Error ({unit})")
        axes[i].set_xticks(days)
        axes[i].grid(True, linestyle="--", alpha=0.3)
        
    if save_path:
        plt.savefig(save_path, dpi=200, bbox_inches="tight")
        print(f"Saved lead time degradation curve to {save_path}")
    plt.close()


def plot_city_timeseries_forecast(
    y_true_seq: np.ndarray,
    y_pred_seq: np.ndarray,
    start_date: str,
    city_name: str = "Bengaluru (Pilot)",
    save_path: Optional[Path] = None
):
    """
    Plots a 14-day time series forecast for a specific city location.
    y_true_seq, y_pred_seq shape: (14, H, W, 3) in physical units.
    """
    city_info = CITIES.get(city_name, CITIES["Bengaluru (Pilot)"])
    cy, cx = city_info["y"], city_info["x"]
    
    dates = pd.date_range(start=start_date, periods=config.SEQ_LEN_OUT, freq="D")
    
    fig, axes = plt.subplots(3, 1, figsize=(12, 8), sharex=True)
    fig.suptitle(f"14-Day Lookahead Forecast vs Observation: {city_name} (Starting {start_date})", fontsize=13, fontweight="bold")
    
    for c, var in enumerate(config.CHANNELS):
        act_vals = y_true_seq[:, cy, cx, c]
        pred_vals = y_pred_seq[:, cy, cx, c]
        unit = "mm/day" if var == "rainfall" else "°C"
        
        if var == "rainfall":
            axes[c].bar(dates, act_vals, width=0.4, label="Actual IMD Rain", color="#3b82f6", alpha=0.7)
            axes[c].plot(dates, pred_vals, marker="o", color="#1d4ed8", label="ConvLSTM Predicted", linewidth=2.5)
        else:
            axes[c].plot(dates, act_vals, marker="o", color="#4b5563", label="Actual IMD", linewidth=2)
            axes[c].plot(dates, pred_vals, marker="s", color="#e11d48", label="ConvLSTM Predicted", linewidth=2.5)
            
        axes[c].set_ylabel(f"{var.upper()} ({unit})", fontweight="bold")
        axes[c].legend(loc="upper left")
        axes[c].grid(True, linestyle="--", alpha=0.3)
        
    axes[-1].set_xlabel("Forecast Date")
    plt.xticks(dates, [d.strftime("%b %d") for d in dates], rotation=30)
    
    if save_path:
        plt.savefig(save_path, dpi=200, bbox_inches="tight")
        print(f"Saved city forecast plot to {save_path}")
    plt.close()
