"""
Spatiotemporal ConvLSTM2D model for multivariate climate forecasting (Rainfall, Tmax, Tmin).
Implements an Encoder-Decoder Spatiotemporal architecture with multi-step forward lookahead.
Custom layers and loss functions are registered with Keras 3 serialization.
"""
import tensorflow as tf
import keras
from tensorflow.keras import layers, models
from pathlib import Path
from typing import Tuple

import sys
sys.path.append(str(Path(__file__).resolve().parent.parent))
import config


@keras.saving.register_keras_serializable(package="ClimateTwin")
class TemporalRepeat(layers.Layer):
    """
    Custom Keras 3 serializable layer to repeat spatial latent state along the temporal axis.
    Input:  (batch, height, width, channels)
    Output: (batch, seq_len_out, height, width, channels)
    """
    def __init__(self, seq_len_out: int = config.SEQ_LEN_OUT, **kwargs):
        super().__init__(**kwargs)
        self.seq_len_out = seq_len_out

    def call(self, inputs):
        expanded = tf.expand_dims(inputs, axis=1)  # (batch, 1, H, W, C)
        return tf.repeat(expanded, repeats=self.seq_len_out, axis=1)  # (batch, seq_len_out, H, W, C)

    def get_config(self):
        config_dict = super().get_config()
        config_dict.update({"seq_len_out": self.seq_len_out})
        return config_dict


@keras.saving.register_keras_serializable(package="ClimateTwin")
def weighted_climate_loss(y_true, y_pred):
    """
    Weighted climate loss function:
    - Rainfall (Channel 0): weighted higher for non-zero rain events to handle extreme sparsity.
    - Temperature (Channels 1 & 2): standard MSE / Huber loss.
    """
    # Rainfall specific penalty
    rain_true = y_true[..., 0:1]
    rain_pred = y_pred[..., 0:1]
    rain_mask = tf.cast(rain_true > 0.05, tf.float32)
    rain_loss = tf.square(rain_true - rain_pred) * (1.0 + 2.0 * rain_mask)

    temp_loss = tf.square(y_true[..., 1:3] - y_pred[..., 1:3])

    combined_loss = tf.concat([rain_loss * 2.0, temp_loss], axis=-1)
    return tf.reduce_mean(combined_loss)


def build_convlstm_model(
    seq_len_in: int = config.SEQ_LEN_IN,
    seq_len_out: int = config.SEQ_LEN_OUT,
    height: int = config.GRID_HEIGHT,
    width: int = config.GRID_WIDTH,
    channels: int = config.NUM_CHANNELS,
    learning_rate: float = config.LEARNING_RATE
) -> tf.keras.Model:
    """
    Builds the ConvLSTM2D Spatiotemporal Encoder-Decoder Model.
    
    Input shape:  (batch, seq_len_in, height, width, channels)  e.g., (None, 30, 32, 32, 3)
    Output shape: (batch, seq_len_out, height, width, channels) e.g., (None, 14, 32, 32, 3)
    """
    inputs = layers.Input(shape=(seq_len_in, height, width, channels), name="historical_sequence")

    # Spatiotemporal Encoder
    # Layer 1: ConvLSTM captures early spatial-temporal dependencies
    x = layers.ConvLSTM2D(
        filters=32,
        kernel_size=(3, 3),
        padding="same",
        return_sequences=True,
        activation="tanh",
        recurrent_activation="sigmoid",
        name="convlstm_enc_1"
    )(inputs)
    x = layers.BatchNormalization(name="bn_enc_1")(x)
    x = layers.SpatialDropout3D(0.1, name="dropout_enc_1")(x)

    # Layer 2: ConvLSTM extracts deep latent spatiotemporal state
    latent_state = layers.ConvLSTM2D(
        filters=32,
        kernel_size=(3, 3),
        padding="same",
        return_sequences=False,
        activation="tanh",
        recurrent_activation="sigmoid",
        name="convlstm_enc_2"
    )(x)  # Shape: (batch, height, width, 32)
    latent_state = layers.BatchNormalization(name="bn_enc_2")(latent_state)

    # Spatiotemporal Decoder
    # Temporal projection: repeat latent state across seq_len_out future days
    repeated_state = TemporalRepeat(seq_len_out=seq_len_out, name="temporal_repeat")(latent_state)

    # Layer 3: ConvLSTM decodes the temporal progression
    x = layers.ConvLSTM2D(
        filters=32,
        kernel_size=(3, 3),
        padding="same",
        return_sequences=True,
        activation="tanh",
        recurrent_activation="sigmoid",
        name="convlstm_dec_1"
    )(repeated_state)
    x = layers.BatchNormalization(name="bn_dec_1")(x)

    # Layer 4: Multi-variable projection with TimeDistributed Conv2D
    # Sigmoid output ensures outputs remain strictly in the normalized [0, 1] range
    outputs = layers.TimeDistributed(
        layers.Conv2D(filters=channels, kernel_size=(3, 3), padding="same", activation="sigmoid"),
        name="forecast_projection"
    )(x)  # Shape: (batch, seq_len_out, height, width, channels)

    model = models.Model(inputs=inputs, outputs=outputs, name="ConvLSTM2D_ClimateDigitalTwin")

    optimizer = tf.keras.optimizers.Adam(learning_rate=learning_rate)
    model.compile(
        optimizer=optimizer,
        loss=weighted_climate_loss,
        metrics=["mae", "mse"]
    )

    return model


if __name__ == "__main__":
    model = build_convlstm_model()
    model.summary()
