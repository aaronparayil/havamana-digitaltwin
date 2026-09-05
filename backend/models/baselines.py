"""
Baseline forecasting models for climate benchmark comparisons:
1. Persistence Baseline (last observed day repeated)
2. Climatological Mean Baseline (historical day-of-year average)
3. Linear Trend Baseline (linear extrapolation per grid cell)
"""
import numpy as np
import pandas as pd
from typing import Dict, Tuple
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).resolve().parent.parent))
import config


class PersistenceBaseline:
    """
    Persistence model: predicts that future days will have the same values
    as the most recent observed day in the input sequence.
    """
    def __init__(self):
        self.name = "Persistence"
        
    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        X shape: (N, seq_len_in, H, W, C)
        Output shape: (N, seq_len_out, H, W, C)
        """
        last_frame = X[:, -1:, :, :, :]  # (N, 1, H, W, C)
        y_pred = np.repeat(last_frame, config.SEQ_LEN_OUT, axis=1)
        return y_pred


class ClimatologyBaseline:
    """
    Climatological Mean model: predicts the historical multi-year average
    for each day-of-year observed during the training period (2010-2020).
    """
    def __init__(self):
        self.name = "Climatology"
        self.climatology_map = {}  # day_of_year (1-366) -> (H, W, C)
        
    def fit(self, normalized_data: np.ndarray, dates: pd.DatetimeIndex, train_years: list):
        """
        Computes day-of-year mean climatology from training years.
        """
        train_mask = np.isin(dates.year, train_years)
        train_data = normalized_data[train_mask]
        train_dates = dates[train_mask]
        
        day_of_years = train_dates.dayofyear
        for doy in range(1, 367):
            doy_mask = (day_of_years == doy)
            if np.any(doy_mask):
                self.climatology_map[doy] = np.mean(train_data[doy_mask], axis=0)
            else:
                # Fallback to nearest day
                self.climatology_map[doy] = np.mean(train_data, axis=0)
                
    def predict_for_dates(self, target_start_dates: pd.DatetimeIndex, num_samples: int) -> np.ndarray:
        """
        Generates predictions based on target calendar dates.
        """
        H, W, C = config.GRID_HEIGHT, config.GRID_WIDTH, config.NUM_CHANNELS
        y_pred = np.zeros((num_samples, config.SEQ_LEN_OUT, H, W, C), dtype=np.float32)
        
        for i, start_date in enumerate(target_start_dates):
            date_seq = pd.date_range(start=start_date, periods=config.SEQ_LEN_OUT, freq="D")
            for t, dt in enumerate(date_seq):
                doy = dt.dayofyear
                y_pred[i, t] = self.climatology_map.get(doy, np.zeros((H, W, C)))
                
        return y_pred


class LinearTrendBaseline:
    """
    Linear Trend Extrapolation: fits an ordinary linear regression along the temporal
    dimension for each spatial pixel over the 30-day window and extrapolates 14 days ahead.
    """
    def __init__(self):
        self.name = "LinearTrend"
        
    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        X shape: (N, seq_len_in, H, W, C)
        Output shape: (N, seq_len_out, H, W, C)
        """
        N, T_in, H, W, C = X.shape
        T_out = config.SEQ_LEN_OUT
        
        # Time steps centered for regression
        t_in = np.arange(T_in, dtype=np.float32)
        t_in_mean = np.mean(t_in)
        t_in_var = np.sum((t_in - t_in_mean) ** 2)
        
        t_out = np.arange(T_in, T_in + T_out, dtype=np.float32)
        
        # X: (N, T_in, H, W, C)
        x_mean = np.mean(X, axis=1, keepdims=True)  # (N, 1, H, W, C)
        
        # Slope: sum((t - t_mean) * (x - x_mean)) / sum((t - t_mean)^2)
        t_diff = (t_in - t_in_mean).reshape((1, T_in, 1, 1, 1))
        slope = np.sum((X - x_mean) * t_diff, axis=1, keepdims=True) / (t_in_var + 1e-8)  # (N, 1, H, W, C)
        intercept = x_mean - slope * t_in_mean  # (N, 1, H, W, C)
        
        # Extrapolate to future timesteps: y = intercept + slope * t_out
        t_out_grid = t_out.reshape((1, T_out, 1, 1, 1))
        y_pred = intercept + slope * t_out_grid
        
        # Clip to valid normalized range [0, 1]
        y_pred = np.clip(y_pred, 0.0, 1.0)
        return y_pred
