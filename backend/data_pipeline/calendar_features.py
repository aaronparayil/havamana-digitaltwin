"""
Calendar feature encoding for conditioning the ConvLSTM2D model on seasonality
and forecast lead-time, independent of the noisy 30-day rolling window.
"""
import numpy as np
import pandas as pd


def encode_day_of_year(dates: pd.DatetimeIndex) -> np.ndarray:
    """
    Encodes each date's day-of-year as a smooth (sin, cos) pair on the unit circle,
    so Dec 31 and Jan 1 are adjacent instead of maximally distant.

    Returns shape (T, 2) float32.
    """
    doy = dates.dayofyear.values.astype(np.float32)
    year_len = np.where(dates.is_leap_year, 366.0, 365.0).astype(np.float32)
    angle = 2.0 * np.pi * (doy - 1.0) / year_len
    return np.stack([np.sin(angle), np.cos(angle)], axis=-1)  # (T, 2)


def build_calendar_sequences(
    dates: pd.DatetimeIndex,
    seq_len_in: int,
    seq_len_out: int
) -> np.ndarray:
    """
    Builds the (sin, cos) day-of-year encoding for the full date index, aligned
    1:1 with the raw time axis so it can be sliced the same way as the climate tensor.

    Returns shape (T, 2) float32.
    """
    return encode_day_of_year(dates)
