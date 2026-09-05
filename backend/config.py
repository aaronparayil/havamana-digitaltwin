"""
Configuration module for the AI-Powered Climate Digital Twin forecasting model.
Defines paths, grid extents, sequence lengths, training splits, and model hyperparams.
"""
import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DATA_DIR = PROJECT_ROOT / "data" / "grd"

RAINFALL_DIR = DATA_DIR / "Yearly Gridded Rainfall (0.25 x 0.25) data Binary File"
TMAX_DIR = DATA_DIR / "Yearly Gridded Maximum Temperature (1.0 x 1.0) data Binary File"
TMIN_DIR = DATA_DIR / "Yearly Gridded Minimum Temperature (1.0 x 1.0) data Binary File"

CACHE_DIR = BASE_DIR / "data_cache"
SAVED_MODELS_DIR = BASE_DIR / "saved_models"
OUTPUTS_DIR = BASE_DIR / "outputs"
FIGURES_DIR = OUTPUTS_DIR / "figures"
METRICS_DIR = OUTPUTS_DIR / "metrics"

for d in [CACHE_DIR, SAVED_MODELS_DIR, FIGURES_DIR, METRICS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Processed NetCDF Cache Paths (Karnataka Pilot)
NC_COMBINED_PATH = CACHE_DIR / "karnataka_climate_fused_2010_2025.nc"
SCALER_PARAMS_PATH = SAVED_MODELS_DIR / "scaler_params_karnataka.json"
MODEL_SAVE_PATH = SAVED_MODELS_DIR / "convlstm_climate_karnataka.keras"
METRICS_SAVE_PATH = METRICS_DIR / "evaluation_metrics_karnataka.json"

# Karnataka State Spatial Domain (High-Resolution Pilot: Lat 11.5°N - 18.5°N, Lon 74.0°E - 78.6°E)
REGION_NAME = "Karnataka"
LAT_MIN = 11.5
LAT_MAX = 18.5
LON_MIN = 74.0
LON_MAX = 78.6

GRID_HEIGHT = 32
GRID_WIDTH = 32
CHANNELS = ["rainfall", "tmax", "tmin"]
NUM_CHANNELS = len(CHANNELS)

# Temporal Sequences
SEQ_LEN_IN = 30    # 30 historical days input
SEQ_LEN_OUT = 14   # 14 future days forecast lookahead

# Chronological Data Splits
START_YEAR = 2010
END_YEAR = 2025

TRAIN_YEARS = list(range(2010, 2021))  # 2010-2020 (11 years)
VAL_YEARS = list(range(2021, 2023))    # 2021-2022 (2 years)
TEST_YEARS = list(range(2023, 2026))   # 2023-2025 (3 years)

# Training Hyperparameters
BATCH_SIZE = 16
LEARNING_RATE = 1e-3
EPOCHS = 25
EARLY_STOPPING_PATIENCE = 7

# Flask API config
API_HOST = "0.0.0.0"
API_PORT = 5005
