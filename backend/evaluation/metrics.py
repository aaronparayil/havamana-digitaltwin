"""
Metrics calculation module for climate spatiotemporal forecasting.
Calculates MAE, RMSE, R-squared across variables, lead times, and spatial grids.
Evaluates in physical units (mm/day and deg C) over valid land points.
"""
import numpy as np
from typing import Dict, Any, Optional
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).resolve().parent.parent))
import config
from data_pipeline.preprocessor import inverse_transform


def calculate_mae(y_true: np.ndarray, y_pred: np.ndarray, mask: Optional[np.ndarray] = None) -> float:
    """Mean Absolute Error over valid points."""
    diff = np.abs(y_true - y_pred)
    if mask is not None:
        return float(np.sum(diff * mask) / (np.sum(mask) + 1e-8))
    return float(np.mean(diff))


def calculate_rmse(y_true: np.ndarray, y_pred: np.ndarray, mask: Optional[np.ndarray] = None) -> float:
    """Root Mean Squared Error over valid points."""
    diff_sq = (y_true - y_pred) ** 2
    if mask is not None:
        mse = np.sum(diff_sq * mask) / (np.sum(mask) + 1e-8)
    else:
        mse = np.mean(diff_sq)
    return float(np.sqrt(mse))


def calculate_r2(y_true: np.ndarray, y_pred: np.ndarray, mask: Optional[np.ndarray] = None) -> float:
    """Coefficient of Determination (R^2) score."""
    if mask is not None:
        y_true_m = y_true[mask.astype(bool)]
        y_pred_m = y_pred[mask.astype(bool)]
    else:
        y_true_m = y_true.flatten()
        y_pred_m = y_pred.flatten()
        
    ss_res = np.sum((y_true_m - y_pred_m) ** 2)
    ss_tot = np.sum((y_true_m - np.mean(y_true_m)) ** 2)
    
    if ss_tot == 0:
        return 0.0
    r2 = 1.0 - (ss_res / (ss_tot + 1e-8))
    return float(r2)


def compute_comprehensive_metrics(
    y_true_norm: np.ndarray,
    y_pred_norm: np.ndarray,
    land_mask: np.ndarray,
    scalers: Dict[str, Dict[str, float]],
    model_name: str = "ConvLSTM2D"
) -> Dict[str, Any]:
    """
    Computes complete evaluation metrics across variables, lead times, and spatial grids in physical units.
    
    Inputs:
    - y_true_norm, y_pred_norm: shape (N, T_out, H, W, C) in [0, 1]
    - land_mask: shape (H, W)
    """
    # Transform to physical units
    y_true = inverse_transform(y_true_norm, scalers)
    y_pred = inverse_transform(y_pred_norm, scalers)
    
    # Broadcast land mask across (N, T_out, H, W, 1)
    N, T_out, H, W, C = y_true.shape
    mask_5d = np.broadcast_to(land_mask.reshape((1, 1, H, W, 1)), (N, T_out, H, W, 1))
    
    metrics = {
        "model_name": model_name,
        "sample_count": N,
        "forecast_horizon_days": T_out,
        "variables": {},
        "lead_time_metrics": {},
        "spatial_error_maps": {}
    }
    
    # 1. Per-variable metrics
    for c, var_name in enumerate(config.CHANNELS):
        yt_c = y_true[..., c:c+1]
        yp_c = y_pred[..., c:c+1]
        
        mae = calculate_mae(yt_c, yp_c, mask_5d)
        rmse = calculate_rmse(yt_c, yp_c, mask_5d)
        r2 = calculate_r2(yt_c, yp_c, mask_5d)
        
        unit = "mm/day" if var_name == "rainfall" else "°C"
        metrics["variables"][var_name] = {
            "unit": unit,
            "MAE": round(mae, 3),
            "RMSE": round(rmse, 3),
            "R2": round(r2, 3)
        }
        
    # 2. Lead-time degradation (Day 1, 2, ..., 14)
    for t in range(T_out):
        day_str = f"day_{t+1}"
        metrics["lead_time_metrics"][day_str] = {}
        for c, var_name in enumerate(config.CHANNELS):
            yt_ct = y_true[:, t, :, :, c:c+1]
            yp_ct = y_pred[:, t, :, :, c:c+1]
            mask_t = mask_5d[:, t, :, :, :]
            
            metrics["lead_time_metrics"][day_str][var_name] = {
                "MAE": round(calculate_mae(yt_ct, yp_ct, mask_t), 3),
                "RMSE": round(calculate_rmse(yt_ct, yp_ct, mask_t), 3),
                "R2": round(calculate_r2(yt_ct, yp_ct, mask_t), 3)
            }
            
    # 3. 2D Spatial error maps (H, W) per variable
    # Mean error per spatial pixel across time and batch
    diff_abs = np.abs(y_true - y_pred)  # (N, T_out, H, W, C)
    spatial_mae = np.mean(diff_abs, axis=(0, 1))  # (H, W, C)
    
    diff_sq = (y_true - y_pred) ** 2
    spatial_rmse = np.sqrt(np.mean(diff_sq, axis=(0, 1)))  # (H, W, C)
    
    for c, var_name in enumerate(config.CHANNELS):
        # Mask out ocean pixels
        mae_map = spatial_mae[..., c] * land_mask
        rmse_map = spatial_rmse[..., c] * land_mask
        
        metrics["spatial_error_maps"][var_name] = {
            "MAE_map": mae_map.tolist(),
            "RMSE_map": rmse_map.tolist()
        }
        
    return metrics
