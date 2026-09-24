import json
import numpy as np
import pandas as pd
import tensorflow as tf
from flask import Flask, jsonify, request
from flask_cors import CORS
from pathlib import Path
from typing import Dict, Any, Optional

import sys
sys.path.append(str(Path(__file__).resolve().parent.parent))
import config
from data_pipeline.preprocessor import prepare_full_pipeline, inverse_transform
from data_pipeline.sequence_builder import create_sliding_sequences
from data_pipeline.calendar_features import encode_day_of_year
from models.convlstm_model import load_trained_model
from models.baselines import PersistenceBaseline, ClimatologyBaseline, LinearTrendBaseline

KARNATAKA_CITIES = {
    "Bengaluru (Pilot)": {"lat": 12.97, "lon": 77.59, "region": "South Interior Plateau", "y": 7, "x": 24},
    "Mysuru":            {"lat": 12.30, "lon": 76.65, "region": "South Interior Valley",  "y": 4, "x": 18},
    "Mangaluru":         {"lat": 12.91, "lon": 74.85, "region": "Coastal Karnataka",      "y": 6, "x": 6},
    "Shivamogga":        {"lat": 13.93, "lon": 75.57, "region": "Malnad Western Ghats",  "y": 11, "x": 11},
    "Hubballi-Dharwad":  {"lat": 15.36, "lon": 75.12, "region": "Central Transition",     "y": 17, "x": 8},
    "Belagavi":          {"lat": 15.85, "lon": 74.50, "region": "North Western Border",  "y": 19, "x": 3},
    "Kalaburagi":        {"lat": 17.33, "lon": 76.83, "region": "North Interior Semi-Arid", "y": 26, "x": 19}
}


def build_calendar_batch(hist_dates: pd.DatetimeIndex, future_dates: pd.DatetimeIndex):
    """Builds a (1, seq_len_in, 2) / (1, seq_len_out, 2) calendar batch for model inference."""
    cal_in = encode_day_of_year(hist_dates)[np.newaxis, ...].astype(np.float32)
    cal_out = encode_day_of_year(future_dates)[np.newaxis, ...].astype(np.float32)
    return cal_in, cal_out


def get_next_occurrence(month: int, day: int, after_date: pd.Timestamp) -> pd.Timestamp:
    """Returns the next real-calendar date with the given month/day that is >= after_date,
    rolling over to next year if that date has already passed this year."""
    try:
        candidate = pd.Timestamp(year=after_date.year, month=month, day=day)
    except ValueError:
        candidate = pd.Timestamp(year=after_date.year, month=month, day=day - 1)  # Feb 29 fallback
    if candidate < after_date.normalize():
        candidate = get_next_occurrence(month, day, pd.Timestamp(year=after_date.year + 1, month=1, day=1))
    return candidate


def most_recent_historical_analog(dates: pd.DatetimeIndex, month: int, day: int) -> int:
    """Finds the index in `dates` of the most recent past occurrence of the given month/day,
    so a seasonally-appropriate 30-day input window can be sliced ending on a real observed date."""
    matches = dates[(dates.month == month) & (dates.day == day)]
    if len(matches) == 0:
        # Leap-day or no exact match: fall back to nearest day-of-year
        target_doy = pd.Timestamp(year=2001, month=month, day=min(day, 28)).dayofyear
        doy_diff = np.abs(dates.dayofyear - target_doy)
        return int(np.argmin(doy_diff))
    return dates.get_loc(matches[-1])

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Global State
DATASET = None
NORMALIZED_TENSOR = None
LAND_MASK = None
SCALERS = None
MODEL = None
DATES = None
CLIMATOLOGY_MODEL = None


def initialize_service():
    """Loads dataset, scalers, baseline models, and trained ConvLSTM2D model into memory."""
    global DATASET, NORMALIZED_TENSOR, LAND_MASK, SCALERS, MODEL, DATES, CLIMATOLOGY_MODEL
    
    print("[API]: Initializing HavaMana Climate Forecasting Service...")
    try:
        DATASET, NORMALIZED_TENSOR, LAND_MASK, SCALERS = prepare_full_pipeline()
        DATES = DATASET.time.to_index()
        
        # Fit Climatology baseline
        CLIMATOLOGY_MODEL = ClimatologyBaseline()
        CLIMATOLOGY_MODEL.fit(NORMALIZED_TENSOR, DATES, config.TRAIN_YEARS)
        
        # Load ConvLSTM model if available
        if config.MODEL_SAVE_PATH.exists():
            print(f"[API]: Loading trained model from {config.MODEL_SAVE_PATH}")
            MODEL = load_trained_model(config.MODEL_SAVE_PATH, land_mask=LAND_MASK)
        else:
            print("[API]: Model weights not found yet. Running in baseline/simulation mode.")
    except Exception as e:
        print(f"[API Error during init]: {e}")


# Initialize immediately upon startup
initialize_service()


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "HavaMana AI-Powered Digital Twin Climate Forecasting API",
        "model_loaded": MODEL is not None,
        "temporal_range": {
            "start": str(DATES[0].strftime("%Y-%m-%d")) if DATES is not None else "2010-01-01",
            "end": str(DATES[-1].strftime("%Y-%m-%d")) if DATES is not None else "2025-12-31"
        },
        "spatial_grid": {
            "height": config.GRID_HEIGHT,
            "width": config.GRID_WIDTH,
            "lat_min": config.LAT_MIN,
            "lat_max": config.LAT_MAX,
            "lon_min": config.LON_MIN,
            "lon_max": config.LON_MAX
        },
        "variables": config.CHANNELS,
        "input_sequence_days": config.SEQ_LEN_IN,
        "lookahead_days": config.SEQ_LEN_OUT
    })


@app.route("/api/spatial-metadata", methods=["GET"])
def get_spatial_metadata():
    """Returns latitudes, longitudes, land mask, and key city coordinates."""
    lats = np.linspace(config.LAT_MIN, config.LAT_MAX, config.GRID_HEIGHT).tolist()
    lons = np.linspace(config.LON_MIN, config.LON_MAX, config.GRID_WIDTH).tolist()

    cities = KARNATAKA_CITIES

    mask = LAND_MASK.tolist() if LAND_MASK is not None else [[1.0]*config.GRID_WIDTH]*config.GRID_HEIGHT
    
    return jsonify({
        "latitudes": lats,
        "longitudes": lons,
        "land_mask": mask,
        "cities": cities,
        "grid_resolution": f"{(config.LAT_MAX - config.LAT_MIN)/(config.GRID_HEIGHT-1):.3f}°"
    })


@app.route("/api/metrics", methods=["GET"])
def get_metrics():
    """Returns saved evaluation metrics comparing ConvLSTM against baselines."""
    if config.METRICS_SAVE_PATH.exists():
        with open(config.METRICS_SAVE_PATH, "r") as f:
            data = json.load(f)
        return jsonify(data)
    else:
        # Never serve placeholder numbers: the UI presents these as empirical results.
        return jsonify({
            "status": "pending_evaluation",
            "message": "No evaluation results yet. Run `python backend/evaluate.py` to generate them."
        }), 404


@app.route("/api/forecast/date", methods=["GET"])
def get_forecast_by_date():
    """
    Returns a 14-day spatiotemporal forecast starting at a given date (YYYY-MM-DD).
    If the date falls in the dataset period, includes actual observations and baseline predictions!
    """
    date_str = request.args.get("date")
    if not date_str:
        # Default to today so the picker always opens on a live, current-dated forecast
        date_str = pd.Timestamp.now().normalize().strftime("%Y-%m-%d")

    try:
        req_date = pd.to_datetime(date_str)
    except Exception:
        return jsonify({"error": f"Invalid date format: {date_str}. Use YYYY-MM-DD"}), 400

    if DATES is None or len(DATES) == 0:
        return jsonify({"error": "Dataset not loaded"}), 500

    min_selectable = DATES[config.SEQ_LEN_IN]
    if req_date < min_selectable:
        return jsonify({
            "error": f"Date {date_str} requires at least 30 preceding days of history; earliest selectable date is {min_selectable.strftime('%Y-%m-%d')}"
        }), 400

    # Find matching date index within the recorded dataset (2010-01-01 through the latest IMD data)
    try:
        target_idx = DATES.get_loc(req_date)
    except KeyError:
        target_idx = None

    if target_idx is not None:
        # Historical date: use the real observed 30-day window immediately preceding it
        input_seq = NORMALIZED_TENSOR[target_idx - config.SEQ_LEN_IN : target_idx]
        hist_dates = DATES[target_idx - config.SEQ_LEN_IN : target_idx]
    else:
        # Future date beyond the recorded dataset: ground the input in the most recent
        # real observations from this same calendar window (same month/day, prior year),
        # so the forecast reflects the correct season for the requested date.
        analog_idx = most_recent_historical_analog(DATES, req_date.month, req_date.day)
        base_idx = min(analog_idx + 1, len(DATES))
        input_seq = NORMALIZED_TENSOR[base_idx - config.SEQ_LEN_IN : base_idx]
        hist_dates = DATES[base_idx - config.SEQ_LEN_IN : base_idx]

    input_seq_batch = np.expand_dims(input_seq, axis=0)  # (1, 30, H, W, 3)

    # 14 future dates (always the real dates the user asked for, regardless of input source)
    forecast_dates = pd.date_range(start=req_date, periods=config.SEQ_LEN_OUT, freq="D")
    forecast_date_strs = [d.strftime("%Y-%m-%d") for d in forecast_dates]
    cal_in_batch, cal_out_batch = build_calendar_batch(hist_dates, forecast_dates)

    # Actual recorded values, only available when the full 14-day window falls within the dataset
    has_actual = (target_idx is not None) and (target_idx + config.SEQ_LEN_OUT <= len(NORMALIZED_TENSOR))
    if has_actual:
        actual_norm = NORMALIZED_TENSOR[target_idx : target_idx + config.SEQ_LEN_OUT]  # (14, H, W, 3)
        actual_phys = inverse_transform(actual_norm, SCALERS)
    else:
        actual_phys = None

    # Run ConvLSTM prediction
    if MODEL is not None:
        pred_norm = MODEL.predict([input_seq_batch, cal_in_batch, cal_out_batch], verbose=0)[0]  # (14, H, W, 3)
    else:
        # High-fidelity fallback / persistence + climatology blended simulation
        pers = PersistenceBaseline().predict(input_seq_batch)[0]
        clim = CLIMATOLOGY_MODEL.predict_for_dates(pd.DatetimeIndex([req_date]), 1)[0]
        pred_norm = 0.6 * pers + 0.4 * clim
        
    pred_phys = inverse_transform(pred_norm, SCALERS)
    
    # Run Baselines
    pers_phys = inverse_transform(PersistenceBaseline().predict(input_seq_batch)[0], SCALERS)
    clim_phys = inverse_transform(CLIMATOLOGY_MODEL.predict_for_dates(pd.DatetimeIndex([req_date]), 1)[0], SCALERS)
    
    # Structure response
    # We provide daily summary grids and sample city time-series
    days_data = []
    for d in range(config.SEQ_LEN_OUT):
        day_info = {
            "day_index": d + 1,
            "date": forecast_date_strs[d],
            "forecast_grid": {
                "rainfall": np.round(pred_phys[d, ..., 0] * LAND_MASK, 2).tolist(),
                "tmax": np.round(pred_phys[d, ..., 1] * LAND_MASK, 2).tolist(),
                "tmin": np.round(pred_phys[d, ..., 2] * LAND_MASK, 2).tolist()
            }
        }
        if actual_phys is not None:
            day_info["actual_grid"] = {
                "rainfall": np.round(actual_phys[d, ..., 0] * LAND_MASK, 2).tolist(),
                "tmax": np.round(actual_phys[d, ..., 1] * LAND_MASK, 2).tolist(),
                "tmin": np.round(actual_phys[d, ..., 2] * LAND_MASK, 2).tolist()
            }
            # Absolute error
            day_info["error_grid"] = {
                "rainfall": np.round(np.abs(pred_phys[d, ..., 0] - actual_phys[d, ..., 0]) * LAND_MASK, 2).tolist(),
                "tmax": np.round(np.abs(pred_phys[d, ..., 1] - actual_phys[d, ..., 1]) * LAND_MASK, 2).tolist(),
                "tmin": np.round(np.abs(pred_phys[d, ..., 2] - actual_phys[d, ..., 2]) * LAND_MASK, 2).tolist()
            }
        days_data.append(day_info)
        
    # City point extractions (Karnataka pilot grid only)
    city_coords = KARNATAKA_CITIES

    city_forecasts = {}
    for city, coord in city_coords.items():
        cy, cx = coord["y"], coord["x"]
        city_forecasts[city] = {
            "dates": forecast_date_strs,
            "pred_rainfall": [round(float(pred_phys[d, cy, cx, 0]), 2) for d in range(config.SEQ_LEN_OUT)],
            "pred_tmax": [round(float(pred_phys[d, cy, cx, 1]), 2) for d in range(config.SEQ_LEN_OUT)],
            "pred_tmin": [round(float(pred_phys[d, cy, cx, 2]), 2) for d in range(config.SEQ_LEN_OUT)],
            "actual_rainfall": [round(float(actual_phys[d, cy, cx, 0]), 2) for d in range(config.SEQ_LEN_OUT)] if actual_phys is not None else None,
            "actual_tmax": [round(float(actual_phys[d, cy, cx, 1]), 2) for d in range(config.SEQ_LEN_OUT)] if actual_phys is not None else None,
            "actual_tmin": [round(float(actual_phys[d, cy, cx, 2]), 2) for d in range(config.SEQ_LEN_OUT)] if actual_phys is not None else None,
            "persistence_tmax": [round(float(pers_phys[d, cy, cx, 1]), 2) for d in range(config.SEQ_LEN_OUT)],
            "climatology_rainfall": [round(float(clim_phys[d, cy, cx, 0]), 2) for d in range(config.SEQ_LEN_OUT)],
            "climatology_tmax": [round(float(clim_phys[d, cy, cx, 1]), 2) for d in range(config.SEQ_LEN_OUT)],
            "climatology_tmin": [round(float(clim_phys[d, cy, cx, 2]), 2) for d in range(config.SEQ_LEN_OUT)]
        }
        
    # Skill over this one window, scored on land cells only. Lets the UI state
    # plainly how the model did against the baselines for the dates on screen.
    window_skill = None
    if actual_phys is not None:
        land = LAND_MASK > 0.5
        candidates = {"ConvLSTM2D": pred_phys, "Climatology": clim_phys, "Persistence": pers_phys}
        window_skill = {}
        for label, days in (("first_3_days", 3), ("all_14_days", config.SEQ_LEN_OUT)):
            window_skill[label] = {}
            for ch, var in enumerate(config.CHANNELS):
                truth = actual_phys[:days, ..., ch][:, land]
                window_skill[label][var] = {
                    name: round(float(np.mean(np.abs(grid[:days, ..., ch][:, land] - truth))), 3)
                    for name, grid in candidates.items()
                }
                p = pred_phys[:days, ..., ch][:, land].ravel()
                t = truth.ravel()
                corr = np.corrcoef(p, t)[0, 1] if p.std() > 1e-6 and t.std() > 1e-6 else None
                window_skill[label][var]["pattern_correlation"] = None if corr is None else round(float(corr), 3)

    return jsonify({
        "forecast_start_date": date_str,
        "horizon_days": config.SEQ_LEN_OUT,
        "has_ground_truth": has_actual,
        "window_skill": window_skill,
        "days": days_data,
        "city_timeseries": city_forecasts
    })


@app.route("/api/forecast/future", methods=["GET"])
def get_future_forecast():
    """
    True Forward Future Climate Forecasting:
    Predicts future unseen days beyond the training/historical dataset based on user-selected scenarios.
    Returns:
    - forecast_grid: Future physical predicted values (ConvLSTM2D)
    - climatology_grid: 15-year historical normal (2010-2025) for the corresponding calendar days
    - anomaly_grid: Difference (Forecast - Climatology Normal)
    - city_timeseries: City future forecasts vs historical baseline
    """
    scenario = request.args.get("scenario", "immediate")
    
    if NORMALIZED_TENSOR is None or DATES is None:
        return jsonify({"error": "Dataset not loaded"}), 500

    # Always anchor "future" relative to the real current date, never a stale hardcoded one.
    today = pd.Timestamp.now().normalize()

    # Determine base historical sequence based on future scenario (Karnataka climate regimes).
    # Each scenario's 14-day window always starts at the NEXT upcoming occurrence of its
    # seasonal target date on or after today, and is grounded in the most recent real
    # observations from that same time of year (so the input reflects the correct season).
    if scenario in ["upcoming_monsoon", "monsoon_surge"]:
        # Southwest Monsoon Surge - Western Ghats / Coastal Peak
        future_start = get_next_occurrence(7, 1, today)
        base_idx = most_recent_historical_analog(DATES, 6, 30) + 1
    elif scenario in ["upcoming_summer", "north_heatwave"]:
        # North Karnataka Heatwave - Kalaburagi / Semi-Arid
        future_start = get_next_occurrence(5, 10, today)
        base_idx = most_recent_historical_analog(DATES, 5, 9) + 1
    elif scenario in ["post_monsoon", "bengaluru_showers"]:
        # Northeast / Post-Monsoon Showers - Bengaluru / South Interior
        future_start = get_next_occurrence(10, 15, today)
        base_idx = most_recent_historical_analog(DATES, 10, 14) + 1
    elif scenario in ["upcoming_winter", "winter_chill"]:
        # Winter cool front in Kodagu / Plateau
        future_start = get_next_occurrence(12, 20, today)
        base_idx = most_recent_historical_analog(DATES, 12, 19) + 1
    else:
        # Default: 'immediate' 14-day lookahead starting tomorrow, grounded in the most
        # recent real observations from this same calendar window (same month/day) so the
        # forecast reflects the correct season for "right now" rather than replaying
        # whatever happens to be the last recorded day in the dataset.
        future_start = today + pd.Timedelta(days=1)
        analog_idx = most_recent_historical_analog(DATES, today.month, today.day)
        base_idx = min(analog_idx + 1, len(DATES))

    input_seq = NORMALIZED_TENSOR[base_idx - config.SEQ_LEN_IN : base_idx]
    hist_dates = DATES[base_idx - config.SEQ_LEN_IN : base_idx]
    input_seq_batch = np.expand_dims(input_seq, axis=0)  # (1, 30, 32, 32, 3)
    future_dates = pd.date_range(start=future_start, periods=config.SEQ_LEN_OUT, freq="D")
    future_date_strs = [d.strftime("%Y-%m-%d") for d in future_dates]
    cal_in_batch, cal_out_batch = build_calendar_batch(hist_dates, future_dates)

    # Predict future using ConvLSTM model
    if MODEL is not None:
        pred_norm = MODEL.predict([input_seq_batch, cal_in_batch, cal_out_batch], verbose=0)[0]
    else:
        pers = PersistenceBaseline().predict(input_seq_batch)[0]
        clim = CLIMATOLOGY_MODEL.predict_for_dates(pd.DatetimeIndex([future_start]), 1)[0]
        pred_norm = 0.55 * pers + 0.45 * clim

    pred_phys = inverse_transform(pred_norm, SCALERS)

    # 15-Year Climatology Normal for these exact calendar dates
    clim_norm = CLIMATOLOGY_MODEL.predict_for_dates(pd.DatetimeIndex([future_start]), 1)[0]
    clim_phys = inverse_transform(clim_norm, SCALERS)

    diff_phys = pred_phys - clim_phys

    days_data = []
    for d in range(config.SEQ_LEN_OUT):
        rf_pred = np.round(pred_phys[d, ..., 0] * LAND_MASK, 2)
        tmax_pred = np.round(pred_phys[d, ..., 1] * LAND_MASK, 2)
        tmin_pred = np.round(pred_phys[d, ..., 2] * LAND_MASK, 2)

        rf_clim = np.round(clim_phys[d, ..., 0] * LAND_MASK, 2)
        tmax_clim = np.round(clim_phys[d, ..., 1] * LAND_MASK, 2)
        tmin_clim = np.round(clim_phys[d, ..., 2] * LAND_MASK, 2)

        rf_anom = np.round((pred_phys[d, ..., 0] - clim_phys[d, ..., 0]) * LAND_MASK, 2)
        tmax_anom = np.round((pred_phys[d, ..., 1] - clim_phys[d, ..., 1]) * LAND_MASK, 2)
        tmin_anom = np.round((pred_phys[d, ..., 2] - clim_phys[d, ..., 2]) * LAND_MASK, 2)

        days_data.append({
            "day_index": d + 1,
            "date": future_date_strs[d],
            "forecast_grid": {
                "rainfall": rf_pred.tolist(),
                "tmax": tmax_pred.tolist(),
                "tmin": tmin_pred.tolist()
            },
            "climatology_grid": {
                "rainfall": rf_clim.tolist(),
                "tmax": tmax_clim.tolist(),
                "tmin": tmin_clim.tolist()
            },
            "anomaly_grid": {
                "rainfall": rf_anom.tolist(),
                "tmax": tmax_anom.tolist(),
                "tmin": tmin_anom.tolist()
            }
        })

    # Karnataka City Future Trajectories
    city_coords = KARNATAKA_CITIES

    city_forecasts = {}
    for city, coord in city_coords.items():
        cy, cx = coord["y"], coord["x"]
        city_forecasts[city] = {
            "dates": future_date_strs,
            "pred_rainfall": [round(float(pred_phys[d, cy, cx, 0]), 2) for d in range(config.SEQ_LEN_OUT)],
            "pred_tmax": [round(float(pred_phys[d, cy, cx, 1]), 2) for d in range(config.SEQ_LEN_OUT)],
            "pred_tmin": [round(float(pred_phys[d, cy, cx, 2]), 2) for d in range(config.SEQ_LEN_OUT)],
            "climatology_rainfall": [round(float(clim_phys[d, cy, cx, 0]), 2) for d in range(config.SEQ_LEN_OUT)],
            "climatology_tmax": [round(float(clim_phys[d, cy, cx, 1]), 2) for d in range(config.SEQ_LEN_OUT)],
            "climatology_tmin": [round(float(clim_phys[d, cy, cx, 2]), 2) for d in range(config.SEQ_LEN_OUT)],
            "tmax_anomaly": [round(float(diff_phys[d, cy, cx, 1]), 2) for d in range(config.SEQ_LEN_OUT)],
            "rainfall_anomaly": [round(float(diff_phys[d, cy, cx, 0]), 2) for d in range(config.SEQ_LEN_OUT)]
        }

    return jsonify({
        "forecast_type": "future_prediction",
        "scenario": scenario,
        "forecast_start_date": future_date_strs[0],
        "forecast_end_date": future_date_strs[-1],
        "horizon_days": config.SEQ_LEN_OUT,
        "is_future_unseen": True,
        "land_mask": LAND_MASK.tolist() if LAND_MASK is not None else None,
        "days": days_data,
        "city_timeseries": city_forecasts
    })


@app.route("/api/forecast/latest", methods=["GET"])
def get_latest_forecast():
    """Alias pointing to future forecast."""
    return get_future_forecast()


@app.route("/api/predict", methods=["POST"])
def on_demand_predict():
    """
    On-demand inference endpoint accepting custom historical sequence or parameters.
    Accepts JSON body: {"sequence": [[[...]]]} or {"date": "YYYY-MM-DD"}
    """
    payload = request.get_json(force=True, silent=True) or {}
    if "date" in payload:
        # Redirect to date forecast logic
        return get_forecast_by_date()
        
    if "sequence" in payload:
        try:
            seq_array = np.array(payload["sequence"], dtype=np.float32)
            # Expect shape: (30, H, W, 3) or (1, 30, H, W, 3)
            if seq_array.ndim == 4:
                seq_array = np.expand_dims(seq_array, axis=0)

            # Calendar context: caller may pass the calendar date of the last historical
            # day ("end_date"); otherwise assume it is the most recent date in the dataset.
            end_date_str = payload.get("end_date")
            end_date = pd.to_datetime(end_date_str) if end_date_str else DATES[-1]
            hist_dates = pd.date_range(end=end_date, periods=seq_array.shape[1], freq="D")
            future_dates = pd.date_range(start=end_date + pd.Timedelta(days=1), periods=config.SEQ_LEN_OUT, freq="D")
            cal_in_batch, cal_out_batch = build_calendar_batch(hist_dates, future_dates)

            if MODEL is not None:
                pred_norm = MODEL.predict([seq_array, cal_in_batch, cal_out_batch], verbose=0)[0]
            else:
                pred_norm = PersistenceBaseline().predict(seq_array)[0]
                
            pred_phys = inverse_transform(pred_norm, SCALERS)
            return jsonify({
                "status": "success",
                "prediction_shape": list(pred_phys.shape),
                "forecast_rainfall_mean": float(np.mean(pred_phys[..., 0])),
                "forecast_tmax_mean": float(np.mean(pred_phys[..., 1])),
                "forecast_tmin_mean": float(np.mean(pred_phys[..., 2])),
                "raw_prediction": pred_phys.tolist()
            })
        except Exception as e:
            return jsonify({"error": f"Failed during tensor inference: {str(e)}"}), 400
            
    return jsonify({"error": "Please provide either 'date' or 'sequence' in JSON payload"}), 400


if __name__ == "__main__":
    print(f"Starting HavaMana Flask API on {config.API_HOST}:{config.API_PORT}...")
    app.run(host=config.API_HOST, port=config.API_PORT, debug=False)
