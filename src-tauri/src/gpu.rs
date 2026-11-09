//! Heat readout from the graphics card through NVML (it ships with the NVIDIA
//! driver). Without an NVIDIA GPU the reading just stays empty.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use nvml_wrapper::enum_wrappers::device::TemperatureSensor;
use nvml_wrapper::Nvml;
use serde::Serialize;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuReading {
    /// Board power across every GPU, in watts.
    pub watts: f64,
    /// The hottest GPU, in °C.
    pub temp_c: Option<f64>,
    /// The busiest GPU, in percent.
    pub util: Option<f64>,
}

pub type SharedReading = Arc<Mutex<Option<GpuReading>>>;

/// Samples the GPUs once a second on a background thread.
pub fn watch() -> SharedReading {
    let reading: SharedReading = Arc::default();
    let out = reading.clone();
    let spawned = std::thread::Builder::new().name("gpu".into()).spawn(move || {
        let Ok(nvml) = Nvml::init() else { return };
        let count = nvml.device_count().unwrap_or(0);
        let devices: Vec<_> = (0..count).filter_map(|i| nvml.device_by_index(i).ok()).collect();
        if devices.is_empty() {
            return;
        }
        loop {
            let mut watts = None::<f64>;
            let mut temp_c = None::<f64>;
            let mut util = None::<f64>;
            for device in &devices {
                if let Ok(mw) = device.power_usage() {
                    *watts.get_or_insert(0.0) += f64::from(mw) / 1000.0;
                }
                if let Ok(t) = device.temperature(TemperatureSensor::Gpu) {
                    temp_c = Some(temp_c.map_or(f64::from(t), |m| m.max(f64::from(t))));
                }
                if let Ok(u) = device.utilization_rates() {
                    util = Some(util.map_or(f64::from(u.gpu), |m| m.max(f64::from(u.gpu))));
                }
            }
            *out.lock().unwrap() = watts.map(|watts| GpuReading { watts, temp_c, util });
            std::thread::sleep(Duration::from_secs(1));
        }
    });
    if let Err(err) = spawned {
        eprintln!("couldn't start the GPU readout: {err}");
    }
    reading
}
