"""
Evaluation CLI script:
- Evaluates ConvLSTM2D and 3 Baseline models (Persistence, Climatology, Linear) on test set (2023-2025).
- Computes MAE, RMSE, and R² for each variable and overall.
- Generates publication-ready figures (Spatial maps, error maps, lead-time curves, benchmark charts).
- Saves metrics JSON for the Flask API and frontend.

Usage:
    python evaluate.py
"""
import json
import numpy as np
import pandas as pd
import tensorflow as tf
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).resolve().parent))
import config
from data_pipeline.preprocessor import prepare_full_pipeline, inverse_transform
from data_pipeline.sequence_builder import create_sliding_sequences, split_chronologically
from models.convlstm_model import WeightedClimateLoss, TemporalRepeat, BroadcastCalendar, LastTimestep, ClipToUnitRange
from models.baselines import PersistenceBaseline, ClimatologyBaseline, LinearTrendBaseline
from evaluation.metrics import compute_comprehensive_metrics
from evaluation.visualizations import (
    plot_actual_vs_predicted_spatial,
    plot_spatial_error_heatmaps,
    plot_model_comparison_bar,
    plot_lead_time_degradation,
    plot_city_timeseries_forecast
)


def main():
    print("=" * 65)
    print("Evaluating AI Climate Digital Twin Forecasting on Test Set (2023-2025)")
    print("=" * 65)

    # 1. Load Data Pipeline
    ds, normalized_tensor, land_mask, scalers = prepare_full_pipeline()
    dates = ds.time.to_index()

    # 2. Build sequences and test split
    X, Y, Cal_in, Cal_out, target_start_dates, target_end_dates = create_sliding_sequences(
        normalized_tensor,
        dates,
        seq_len_in=config.SEQ_LEN_IN,
        seq_len_out=config.SEQ_LEN_OUT
    )
    splits = split_chronologically(X, Y, Cal_in, Cal_out, target_start_dates)
    X_test, Y_test, Cal_in_test, Cal_out_test, test_dates = splits["test"]

    print(f"\nEvaluating on {X_test.shape[0]} test sequences across {config.SEQ_LEN_OUT}-day lookaheads.")

    # 3. Load Trained ConvLSTM Model
    if not config.MODEL_SAVE_PATH.exists():
        print(f"\n[WARNING]: Trained model not found at {config.MODEL_SAVE_PATH}.")
        print("Please train the model first by running `python train.py`.")
        return

    print(f"Loading trained ConvLSTM model from: {config.MODEL_SAVE_PATH}...")
    custom_objects = {
        "WeightedClimateLoss": WeightedClimateLoss,
        "TemporalRepeat": TemporalRepeat,
        "BroadcastCalendar": BroadcastCalendar,
        "LastTimestep": LastTimestep,
        "ClipToUnitRange": ClipToUnitRange
    }
    model = tf.keras.models.load_model(config.MODEL_SAVE_PATH, custom_objects=custom_objects)

    # 4. Run Model Predictions
    print("Running ConvLSTM2D inference...")
    y_pred_convlstm = model.predict([X_test, Cal_in_test, Cal_out_test], batch_size=config.BATCH_SIZE, verbose=1)

    # 5. Run Baseline Models
    print("Running Baseline Models for benchmark comparison...")
    # Persistence
    persistence = PersistenceBaseline()
    y_pred_persistence = persistence.predict(X_test)

    # Climatology
    climatology = ClimatologyBaseline()
    climatology.fit(normalized_tensor, dates, config.TRAIN_YEARS)
    y_pred_climatology = climatology.predict_for_dates(test_dates, len(X_test))

    # Linear Trend
    linear_trend = LinearTrendBaseline()
    y_pred_linear = linear_trend.predict(X_test)

    # 6. Compute Comprehensive Metrics
    print("\nComputing physical metrics (MAE, RMSE, R²)...")
    metrics_convlstm = compute_comprehensive_metrics(Y_test, y_pred_convlstm, land_mask, scalers, "ConvLSTM2D")
    metrics_persistence = compute_comprehensive_metrics(Y_test, y_pred_persistence, land_mask, scalers, "Persistence")
    metrics_climatology = compute_comprehensive_metrics(Y_test, y_pred_climatology, land_mask, scalers, "Climatology")
    metrics_linear = compute_comprehensive_metrics(Y_test, y_pred_linear, land_mask, scalers, "LinearTrend")

    all_benchmark_metrics = {
        "ConvLSTM2D": metrics_convlstm,
        "Persistence": metrics_persistence,
        "Climatology": metrics_climatology,
        "LinearTrend": metrics_linear
    }

    # Save to JSON
    with open(config.METRICS_SAVE_PATH, "w") as f:
        json.dump(all_benchmark_metrics, f, indent=2)
    print(f"\nSaved evaluation metrics to: {config.METRICS_SAVE_PATH}")

    # 7. Print Comparative Performance Table
    print("\n" + "=" * 78)
    print(f"{'Model':<15} | {'Rainfall (MAE/RMSE/R²)':<25} | {'Tmax (MAE/RMSE/R²)':<22} | {'Tmin (MAE/RMSE/R²)'}")
    print("-" * 78)
    for name, m in all_benchmark_metrics.items():
        rf = m["variables"]["rainfall"]
        tmax = m["variables"]["tmax"]
        tmin = m["variables"]["tmin"]
        print(f"{name:<15} | {rf['MAE']:>5.2f} / {rf['RMSE']:>5.2f} / {rf['R2']:>5.2f} | "
              f"{tmax['MAE']:>5.2f} / {tmax['RMSE']:>5.2f} / {tmax['R2']:>5.2f} | "
              f"{tmin['MAE']:>5.2f} / {tmin['RMSE']:>5.2f} / {tmin['R2']:>5.2f}")
    print("=" * 78)

    # 8. Generate Visualizations
    print("\nGenerating evaluation charts & maps...")

    # Benchmark bar chart
    plot_model_comparison_bar(all_benchmark_metrics, save_path=config.FIGURES_DIR / "model_comparison.png")

    # Spatial MAE error maps
    plot_spatial_error_heatmaps(
        metrics_convlstm["spatial_error_maps"],
        land_mask,
        save_path=config.FIGURES_DIR / "spatial_error_heatmaps.png"
    )

    # Lead-time degradation curve
    plot_lead_time_degradation(
        metrics_convlstm["lead_time_metrics"],
        save_path=config.FIGURES_DIR / "lead_time_degradation.png"
    )

    # Sample Spatial Actual vs Predicted (Monsoon Season e.g., July 2024 & Summer May 2024)
    Y_test_phys = inverse_transform(Y_test, scalers)
    y_pred_convlstm_phys = inverse_transform(y_pred_convlstm, scalers)

    # Pick monsoon index in test set (around July 15, 2024)
    monsoon_indices = [i for i, d in enumerate(test_dates) if d.year == 2024 and d.month == 7 and d.day == 15]
    sample_idx = monsoon_indices[0] if monsoon_indices else 100

    target_date_str = test_dates[sample_idx].strftime("%Y-%m-%d")
    plot_actual_vs_predicted_spatial(
        Y_test_phys[sample_idx, 0],  # Lead Day +1
        y_pred_convlstm_phys[sample_idx, 0],
        land_mask,
        target_date=target_date_str,
        lead_day=1,
        save_path=config.FIGURES_DIR / "actual_vs_pred_monsoon_lead1.png"
    )
    plot_actual_vs_predicted_spatial(
        Y_test_phys[sample_idx, 6],  # Lead Day +7
        y_pred_convlstm_phys[sample_idx, 6],
        land_mask,
        target_date=target_date_str,
        lead_day=7,
        save_path=config.FIGURES_DIR / "actual_vs_pred_monsoon_lead7.png"
    )

    # City Time Series Forecasts (Karnataka Key Hubs)
    for city in ["Bengaluru (Pilot)", "Mangaluru", "Kalaburagi"]:
        clean_city_name = city.lower().replace(" ", "_").replace("(", "").replace(")", "")
        plot_city_timeseries_forecast(
            Y_test_phys[sample_idx],
            y_pred_convlstm_phys[sample_idx],
            start_date=target_date_str,
            city_name=city,
            save_path=config.FIGURES_DIR / f"timeseries_forecast_{clean_city_name}.png"
        )

    print(f"\nAll evaluation plots and metrics successfully generated in {config.OUTPUTS_DIR}!")


if __name__ == "__main__":
    main()
