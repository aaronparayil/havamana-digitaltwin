"""
Sequence builder module for creating sliding window spatiotemporal datasets
and chronological train/validation/test splits for ConvLSTM2D forecasting.
"""
import numpy as np
import pandas as pd
import tensorflow as tf
from typing import Tuple, Dict, List, Optional
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).resolve().parent.parent))
import config


def create_sliding_sequences(
    data: np.ndarray,
    dates: pd.DatetimeIndex,
    seq_len_in: int = config.SEQ_LEN_IN,
    seq_len_out: int = config.SEQ_LEN_OUT
) -> Tuple[np.ndarray, np.ndarray, pd.DatetimeIndex, pd.DatetimeIndex]:
    """
    Creates sliding-window sequences from multi-channel spatiotemporal tensor.
    
    Parameters:
    - data: shape (T, H, W, C)
    - dates: DatetimeIndex of length T
    
    Returns:
    - X: shape (N, seq_len_in, H, W, C)
    - Y: shape (N, seq_len_out, H, W, C)
    - target_start_dates: start date for each forecast target sequence
    - target_end_dates: end date for each forecast target sequence
    """
    total_time = len(data)
    num_samples = total_time - seq_len_in - seq_len_out + 1
    
    h, w, c = data.shape[1], data.shape[2], data.shape[3]
    
    X = np.zeros((num_samples, seq_len_in, h, w, c), dtype=np.float32)
    Y = np.zeros((num_samples, seq_len_out, h, w, c), dtype=np.float32)
    
    target_start_dates = []
    target_end_dates = []
    
    for i in range(num_samples):
        X[i] = data[i : i + seq_len_in]
        Y[i] = data[i + seq_len_in : i + seq_len_in + seq_len_out]
        target_start_dates.append(dates[i + seq_len_in])
        target_end_dates.append(dates[i + seq_len_in + seq_len_out - 1])
        
    return X, Y, pd.DatetimeIndex(target_start_dates), pd.DatetimeIndex(target_end_dates)


def split_chronologically(
    X: np.ndarray,
    Y: np.ndarray,
    target_start_dates: pd.DatetimeIndex,
    train_years: List[int] = config.TRAIN_YEARS,
    val_years: List[int] = config.VAL_YEARS,
    test_years: List[int] = config.TEST_YEARS
) -> Dict[str, Tuple[np.ndarray, np.ndarray, pd.DatetimeIndex]]:
    """
    Splits the spatiotemporal sequences chronologically based on the forecast target year.
    """
    target_years = target_start_dates.year
    
    train_mask = np.isin(target_years, train_years)
    val_mask = np.isin(target_years, val_years)
    test_mask = np.isin(target_years, test_years)
    
    splits = {
        "train": (X[train_mask], Y[train_mask], target_start_dates[train_mask]),
        "val": (X[val_mask], Y[val_mask], target_start_dates[val_mask]),
        "test": (X[test_mask], Y[test_mask], target_start_dates[test_mask])
    }
    
    print(f"Data Splits Chronologically:")
    print(f"  Train ({train_years[0]}-{train_years[-1]}): {splits['train'][0].shape[0]} sequences")
    print(f"  Val   ({val_years[0]}-{val_years[-1]}):   {splits['val'][0].shape[0]} sequences")
    print(f"  Test  ({test_years[0]}-{test_years[-1]}):  {splits['test'][0].shape[0]} sequences")
    
    return splits


def get_tf_dataset(
    X: np.ndarray,
    Y: np.ndarray,
    batch_size: int = config.BATCH_SIZE,
    shuffle: bool = True
) -> tf.data.Dataset:
    """
    Converts numpy arrays into an optimized tf.data.Dataset with prefetching.
    """
    ds = tf.data.Dataset.from_tensor_slices((X, Y))
    if shuffle:
        ds = ds.shuffle(buffer_size=1024, seed=42)
    ds = ds.batch(batch_size).prefetch(tf.data.AUTOTUNE)
    return ds
