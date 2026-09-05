"""
Main CLI script to train the ConvLSTM2D Spatiotemporal Climate Forecasting Model.

Usage:
    python train.py [--epochs 25] [--batch-size 16] [--quick-test]
"""
import argparse
import time
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).resolve().parent))
import config
from data_pipeline.preprocessor import prepare_full_pipeline
from data_pipeline.sequence_builder import create_sliding_sequences, split_chronologically
from training.trainer import ClimateModelTrainer


def main():
    parser = argparse.ArgumentParser(description="Train ConvLSTM2D Climate Forecasting Model")
    parser.add_argument("--epochs", type=int, default=config.EPOCHS, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=config.BATCH_SIZE, help="Batch size for training")
    parser.add_argument("--quick-test", action="store_true", help="Run a quick 2-epoch test on a small subset")
    parser.add_argument("--force-recompute", action="store_true", help="Force recomputation of NetCDF cache")
    args = parser.parse_args()

    start_time = time.time()
    print("=" * 60)
    print("HavaMana: AI-Powered Digital Twin Climate Forecasting Model")
    print("=" * 60)

    # 1. Prepare Data Pipeline
    ds, normalized_tensor, land_mask, scalers = prepare_full_pipeline(force_recompute=args.force_recompute)

    # 2. Build Spatiotemporal Sliding Sequences
    print("\nBuilding sliding temporal sequences (30 days in -> 14 days out)...")
    X, Y, target_start_dates, target_end_dates = create_sliding_sequences(
        normalized_tensor,
        ds.time.to_index(),
        seq_len_in=config.SEQ_LEN_IN,
        seq_len_out=config.SEQ_LEN_OUT
    )

    # 3. Chronological Splits (Train: 2010-2020, Val: 2021-2022, Test: 2023-2025)
    splits = split_chronologically(X, Y, target_start_dates)
    X_train, Y_train, _ = splits["train"]
    X_val, Y_val, _ = splits["val"]

    epochs = 2 if args.quick_test else args.epochs
    batch_size = args.batch_size

    if args.quick_test:
        print("\n[QUICK TEST MODE]: Subsampling data for fast execution verification...")
        X_train, Y_train = X_train[:64], Y_train[:64]
        X_val, Y_val = X_val[:32], Y_val[:32]

    # 4. Train ConvLSTM Model
    trainer = ClimateModelTrainer(save_path=config.MODEL_SAVE_PATH)
    trainer.train(
        train_data=(X_train, Y_train),
        val_data=(X_val, Y_val),
        epochs=epochs,
        batch_size=batch_size,
        patience=config.EARLY_STOPPING_PATIENCE
    )

    elapsed = time.time() - start_time
    print(f"\nTraining pipeline completed in {elapsed / 60:.2f} minutes.")
    print("Run `python evaluate.py` to evaluate on the 2023-2025 test set and generate error maps.")


if __name__ == "__main__":
    main()
