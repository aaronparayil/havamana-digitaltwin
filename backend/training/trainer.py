"""
Trainer module for training the ConvLSTM2D spatiotemporal model on IMD climate data.
Features:
- Chronological early stopping
- Reduce learning rate on plateau
- Best model checkpointing (.keras format)
- Training & validation loss history tracking and plotting
"""
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from pathlib import Path
from typing import Dict, Tuple, Any, Optional

import sys
sys.path.append(str(Path(__file__).resolve().parent.parent))
import config
from models.convlstm_model import build_convlstm_model
from data_pipeline.sequence_builder import get_tf_dataset


class ClimateModelTrainer:
    def __init__(
        self,
        model: tf.keras.Model = None,
        learning_rate: float = config.LEARNING_RATE,
        save_path: Path = config.MODEL_SAVE_PATH,
        land_mask: Optional[np.ndarray] = None
    ):
        self.save_path = Path(save_path)
        self.model = model if model is not None else build_convlstm_model(learning_rate=learning_rate, land_mask=land_mask)
        self.history = None

    def train(
        self,
        train_data: Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray],
        val_data: Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray],
        epochs: int = config.EPOCHS,
        batch_size: int = config.BATCH_SIZE,
        patience: int = config.EARLY_STOPPING_PATIENCE
    ) -> tf.keras.callbacks.History:
        """
        Executes model training with early stopping and learning rate scheduling.
        train_data / val_data: (X, Y, Cal_in, Cal_out)
        """
        X_train, Y_train, Cal_in_train, Cal_out_train = train_data
        X_val, Y_val, Cal_in_val, Cal_out_val = val_data

        print(f"\n==========================================")
        print(f"Starting ConvLSTM2D Training on Karnataka Climate Grids")
        print(f"Train samples: {X_train.shape[0]} | Val samples: {X_val.shape[0]}")
        print(f"Input Shape:   {X_train.shape[1:]} (30 days x 32 x 32 x 3)")
        print(f"Target Shape:  {Y_train.shape[1:]} (14 days lookahead x 32 x 32 x 3)")
        print(f"Epochs:        {epochs} | Batch size: {batch_size}")
        print(f"==========================================\n")

        train_ds = get_tf_dataset(X_train, Y_train, Cal_in_train, Cal_out_train, batch_size=batch_size, shuffle=True)
        val_ds = get_tf_dataset(X_val, Y_val, Cal_in_val, Cal_out_val, batch_size=batch_size, shuffle=False)
        
        callbacks = [
            tf.keras.callbacks.EarlyStopping(
                monitor="val_loss",
                patience=patience,
                restore_best_weights=True,
                verbose=1
            ),
            tf.keras.callbacks.ReduceLROnPlateau(
                monitor="val_loss",
                factor=0.5,
                patience=2,
                min_lr=1e-6,
                verbose=1
            ),
            tf.keras.callbacks.ModelCheckpoint(
                filepath=str(self.save_path),
                monitor="val_loss",
                save_best_only=True,
                verbose=1
            )
        ]
        
        self.history = self.model.fit(
            train_ds,
            validation_data=val_ds,
            epochs=epochs,
            callbacks=callbacks,
            verbose=1
        )
        
        # Save final model explicitly
        self.model.save(self.save_path)
        print(f"\nSuccessfully saved trained ConvLSTM model to: {self.save_path}")
        
        # Plot and save learning curves
        self.plot_learning_curves()
        return self.history
        
    def plot_learning_curves(self, save_path: Path = config.FIGURES_DIR / "training_curves.png"):
        """Plots training and validation loss curves."""
        if self.history is None:
            return
            
        fig, ax = plt.subplots(figsize=(8, 5))
        ax.plot(self.history.history["loss"], label="Training Loss (Weighted)", color="#3b82f6", linewidth=2)
        ax.plot(self.history.history["val_loss"], label="Validation Loss", color="#ef4444", linewidth=2)
        ax.set_title("ConvLSTM2D Climate Model Training & Validation Loss", fontsize=12, fontweight="bold")
        ax.set_xlabel("Epoch")
        ax.set_ylabel("Weighted Loss")
        ax.legend()
        ax.grid(True, linestyle="--", alpha=0.4)
        
        plt.savefig(save_path, dpi=200, bbox_inches="tight")
        print(f"Saved learning curves to {save_path}")
        plt.close()
