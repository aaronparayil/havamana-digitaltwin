"""
Spatiotemporal ConvLSTM2D model for multivariate climate forecasting (Rainfall, Tmax, Tmin).
Implements a calendar-conditioned, persistence-residual Encoder-Decoder architecture with
multi-step forward lookahead. Custom layers and loss functions are registered with Keras 3
serialization.
"""
import numpy as np
import tensorflow as tf
import keras
from tensorflow.keras import layers, models
from pathlib import Path
from typing import Tuple, Optional

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
class BroadcastCalendar(layers.Layer):
    """
    Broadcasts a per-timestep calendar vector (batch, T, F) spatially into
    (batch, T, height, width, F) so it can be concatenated with spatial feature maps.
    Conditions the encoder/decoder on day-of-year seasonality and forecast lead-time
    without materializing the broadcast tensors outside the graph.
    """
    def __init__(self, height: int = config.GRID_HEIGHT, width: int = config.GRID_WIDTH, **kwargs):
        super().__init__(**kwargs)
        self.height = height
        self.width = width

    def call(self, inputs):
        # inputs: (batch, T, F)
        x = inputs[:, :, tf.newaxis, tf.newaxis, :]  # (batch, T, 1, 1, F)
        return tf.tile(x, [1, 1, self.height, self.width, 1])

    def get_config(self):
        config_dict = super().get_config()
        config_dict.update({"height": self.height, "width": self.width})
        return config_dict


@keras.saving.register_keras_serializable(package="ClimateTwin")
class LastTimestep(layers.Layer):
    """Extracts the final timestep of a (batch, T, H, W, C) sequence tensor."""
    def call(self, inputs):
        return inputs[:, -1, :, :, :]


@keras.saving.register_keras_serializable(package="ClimateTwin")
class ClipToUnitRange(layers.Layer):
    """Clips the persistence-residual sum back into the normalized [0, 1] range."""
    def call(self, inputs):
        return tf.clip_by_value(inputs, 0.0, 1.0)


@keras.saving.register_keras_serializable(package="ClimateTwin")
class WeightedClimateLoss(keras.losses.Loss):
    """
    Land-mask-aware weighted climate loss:
    - Restricts the loss to valid Karnataka land pixels so the model isn't rewarded for
      trivially predicting the constant-zero ocean/out-of-state cells that make up a
      large fraction of the 32x32 grid.
    - Rainfall (Channel 0): weighted higher for non-zero rain events to handle extreme sparsity.
    - Temperature (Channels 1 & 2): standard MSE.
    """
    def __init__(self, land_mask=None, name: str = "weighted_climate_loss", **kwargs):
        super().__init__(name=name, **kwargs)
        if land_mask is None:
            mask_np = np.ones((config.GRID_HEIGHT, config.GRID_WIDTH), dtype=np.float32)
        else:
            mask_np = np.asarray(land_mask, dtype=np.float32)
        self.land_mask_list = mask_np.tolist()
        # Shape (1, 1, H, W, 1) for broadcasting over (batch, time, H, W, channel)
        self._mask_tensor = tf.constant(mask_np.reshape(1, 1, *mask_np.shape, 1), dtype=tf.float32)

    def call(self, y_true, y_pred):
        rain_true = y_true[..., 0:1]
        rain_pred = y_pred[..., 0:1]
        rain_mask = tf.cast(rain_true > 0.05, tf.float32)
        rain_loss = tf.square(rain_true - rain_pred) * (1.0 + 2.0 * rain_mask) * 2.0

        temp_loss = tf.square(y_true[..., 1:3] - y_pred[..., 1:3])

        combined_loss = tf.concat([rain_loss, temp_loss], axis=-1)  # (batch, T, H, W, C)
        mask_broadcast = tf.ones_like(combined_loss) * self._mask_tensor
        masked_loss = combined_loss * self._mask_tensor
        return tf.reduce_sum(masked_loss) / (tf.reduce_sum(mask_broadcast) + 1e-8)

    def get_config(self):
        cfg = super().get_config()
        cfg.update({"land_mask": self.land_mask_list})
        return cfg


def build_convlstm_model(
    seq_len_in: int = config.SEQ_LEN_IN,
    seq_len_out: int = config.SEQ_LEN_OUT,
    height: int = config.GRID_HEIGHT,
    width: int = config.GRID_WIDTH,
    channels: int = config.NUM_CHANNELS,
    learning_rate: float = config.LEARNING_RATE,
    land_mask: Optional[np.ndarray] = None,
    filters: int = 32
) -> tf.keras.Model:
    """
    Builds the calendar-conditioned, persistence-residual ConvLSTM2D Encoder-Decoder.

    Inputs:
    - historical_sequence: (batch, seq_len_in, H, W, C)   e.g. (None, 30, 32, 32, 3)
    - historical_calendar: (batch, seq_len_in, 2)         sin/cos day-of-year for input days
    - future_calendar:     (batch, seq_len_out, 2)        sin/cos day-of-year for forecast days

    Output: (batch, seq_len_out, H, W, C)  e.g. (None, 14, 32, 32, 3)

    The future calendar signal lets each of the 14 decoder steps know *which* calendar day
    it is forecasting (instead of decoding 14 identical repeated frames blind to lead-time),
    and the persistence residual grounds every prediction in the last observed day so the
    network only has to learn the *change* from now, not the absolute climate state.
    """
    hist_input = layers.Input(shape=(seq_len_in, height, width, channels), name="historical_sequence")
    hist_calendar = layers.Input(shape=(seq_len_in, 2), name="historical_calendar")
    future_calendar = layers.Input(shape=(seq_len_out, 2), name="future_calendar")

    # Condition the encoder input on seasonality
    hist_cal_grid = BroadcastCalendar(height=height, width=width, name="broadcast_hist_calendar")(hist_calendar)
    encoder_input = layers.Concatenate(axis=-1, name="concat_hist_calendar")([hist_input, hist_cal_grid])

    # Spatiotemporal Encoder
    x = layers.ConvLSTM2D(
        filters=filters,
        kernel_size=(3, 3),
        padding="same",
        return_sequences=True,
        activation="tanh",
        recurrent_activation="sigmoid",
        name="convlstm_enc_1"
    )(encoder_input)
    x = layers.BatchNormalization(name="bn_enc_1")(x)
    x = layers.SpatialDropout3D(0.1, name="dropout_enc_1")(x)

    latent_state = layers.ConvLSTM2D(
        filters=filters,
        kernel_size=(3, 3),
        padding="same",
        return_sequences=False,
        activation="tanh",
        recurrent_activation="sigmoid",
        name="convlstm_enc_2"
    )(x)  # Shape: (batch, height, width, filters)
    latent_state = layers.BatchNormalization(name="bn_enc_2")(latent_state)

    # Spatiotemporal Decoder: repeat latent state, but condition each of the 14 steps
    # on its own future calendar day so the decoder isn't decoding 14 identical inputs.
    repeated_state = TemporalRepeat(seq_len_out=seq_len_out, name="temporal_repeat")(latent_state)
    future_cal_grid = BroadcastCalendar(height=height, width=width, name="broadcast_future_calendar")(future_calendar)
    decoder_input = layers.Concatenate(axis=-1, name="concat_decoder_calendar")([repeated_state, future_cal_grid])

    x = layers.ConvLSTM2D(
        filters=filters,
        kernel_size=(3, 3),
        padding="same",
        return_sequences=True,
        activation="tanh",
        recurrent_activation="sigmoid",
        name="convlstm_dec_1"
    )(decoder_input)
    x = layers.BatchNormalization(name="bn_dec_1")(x)
    x = layers.SpatialDropout3D(0.1, name="dropout_dec_1")(x)

    x = layers.ConvLSTM2D(
        filters=filters,
        kernel_size=(3, 3),
        padding="same",
        return_sequences=True,
        activation="tanh",
        recurrent_activation="sigmoid",
        name="convlstm_dec_2"
    )(x)
    x = layers.BatchNormalization(name="bn_dec_2")(x)

    # Linear residual head: predicts the *change* from the last observed day
    delta = layers.TimeDistributed(
        layers.Conv2D(filters=channels, kernel_size=(3, 3), padding="same", activation="linear"),
        name="forecast_delta"
    )(x)  # Shape: (batch, seq_len_out, H, W, C)

    last_observed_day = LastTimestep(name="last_observed_day")(hist_input)
    persistence = TemporalRepeat(seq_len_out=seq_len_out, name="temporal_repeat_persistence")(last_observed_day)

    outputs = layers.Add(name="persistence_plus_delta")([persistence, delta])
    outputs = ClipToUnitRange(name="clip_unit_range")(outputs)

    model = models.Model(
        inputs=[hist_input, hist_calendar, future_calendar],
        outputs=outputs,
        name="ConvLSTM2D_ClimateDigitalTwin"
    )

    optimizer = tf.keras.optimizers.Adam(learning_rate=learning_rate)
    loss_fn = WeightedClimateLoss(land_mask=land_mask)
    model.compile(
        optimizer=optimizer,
        loss=loss_fn,
        metrics=["mae", "mse"]
    )

    return model


if __name__ == "__main__":
    model = build_convlstm_model()
    model.summary()
