class BLEManager {
    // Standard Health Device UUIDs
    static HEALTH_SERVICE_UUID = '0x183C'; // Health Thermometer Service
    static PPG_SERVICE_UUID = '0x1822';    // Custom PPG Service
    static STEP_SERVICE_UUID = '0x1814';   // Running Speed and Cadence

    static CHARACTERISTICS = {
        PPG_MEASUREMENT: '0x2A37',         // Heart Rate Measurement characteristic
        SPO2_MEASUREMENT: '0x2A5F',        // Custom SpO2 characteristic
        TEMPERATURE: '0x2A1C',             // Temperature Measurement
        STEP_COUNT: '0x2A53',              // RSC Measurement
    };

    constructor(onDataCallback, onConnectionChange) {
        this.device = null;
        this.server = null;
        this.characteristics = new Map();
        this.isConnected = false;
        this.onDataCallback = onDataCallback;
        this.onConnectionChange = onConnectionChange;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
    }

    async connect() {
        if (!navigator.bluetooth) {
            throw new Error('Bluetooth not supported in this browser');
        }

        try {
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: [BLEManager.HEALTH_SERVICE_UUID] },
                    { services: [BLEManager.PPG_SERVICE_UUID] },
                    { services: [BLEManager.STEP_SERVICE_UUID] }
                ],
                optionalServices: [] // Add any additional services here
            });

            this.device.addEventListener('gattserverdisconnected', this.handleDisconnection.bind(this));
            await this.connectToDevice();
        } catch (error) {
            console.error('BLE Connection Error:', error);
            throw error;
        }
    }

    async connectToDevice() {
        try {
            this.server = await this.device.gatt.connect();
            await this.setupCharacteristics();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            this.onConnectionChange(true);
            console.log('BLE Connected successfully');
        } catch (error) {
            console.error('Connection to device failed:', error);
            throw error;
        }
    }

    async setupCharacteristics() {
        // Setup PPG Service
        const ppgService = await this.server.getPrimaryService(BLEManager.PPG_SERVICE_UUID);
        const ppgChar = await ppgService.getCharacteristic(BLEManager.CHARACTERISTICS.PPG_MEASUREMENT);
        await ppgChar.startNotifications();
        ppgChar.addEventListener('characteristicvaluechanged', this.handlePPGData.bind(this));
        this.characteristics.set('ppg', ppgChar);

        // Setup Health Service (Temperature and SpO2)
        const healthService = await this.server.getPrimaryService(BLEManager.HEALTH_SERVICE_UUID);
        const tempChar = await healthService.getCharacteristic(BLEManager.CHARACTERISTICS.TEMPERATURE);
        const spo2Char = await healthService.getCharacteristic(BLEManager.CHARACTERISTICS.SPO2_MEASUREMENT);
        
        await tempChar.startNotifications();
        await spo2Char.startNotifications();
        
        tempChar.addEventListener('characteristicvaluechanged', this.handleTemperatureData.bind(this));
        spo2Char.addEventListener('characteristicvaluechanged', this.handleSpO2Data.bind(this));
        
        this.characteristics.set('temperature', tempChar);
        this.characteristics.set('spo2', spo2Char);

        // Setup Step Counter
        const stepService = await this.server.getPrimaryService(BLEManager.STEP_SERVICE_UUID);
        const stepChar = await stepService.getCharacteristic(BLEManager.CHARACTERISTICS.STEP_COUNT);
        await stepChar.startNotifications();
        stepChar.addEventListener('characteristicvaluechanged', this.handleStepData.bind(this));
        this.characteristics.set('steps', stepChar);
    }

    async handleDisconnection() {
        this.isConnected = false;
        this.onConnectionChange(false);
        console.log('Device disconnected');

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            
            setTimeout(async () => {
                try {
                    await this.connectToDevice();
                } catch (error) {
                    console.error('Reconnection attempt failed:', error);
                    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000); // Exponential backoff, max 10 seconds
                }
            }, this.reconnectDelay);
        } else {
            console.log('Max reconnection attempts reached. Switching to simulated data.');
            this.onConnectionChange(false, true); // Indicate switching to simulation
        }
    }

    // Data Handlers
    handlePPGData(event) {
        const value = event.target.value;
        // Parse PPG data according to your device's data format
        const ppgValue = this.parsePPGData(value);
        this.onDataCallback('ppg', ppgValue);
    }

    handleSpO2Data(event) {
        const value = event.target.value;
        // Parse SpO2 data
        const spo2Value = this.parseSpO2Data(value);
        this.onDataCallback('spo2', spo2Value);
    }

    handleTemperatureData(event) {
        const value = event.target.value;
        // Parse temperature data
        const tempValue = this.parseTemperatureData(value);
        this.onDataCallback('temperature', tempValue);
    }

    handleStepData(event) {
        const value = event.target.value;
        // Parse step data
        const steps = this.parseStepData(value);
        this.onDataCallback('steps', steps);
    }

    // Data Parser Methods
    parsePPGData(value) {
        // Implement according to your device's data format
        const buffer = new Uint8Array(value.buffer);
        return buffer[0] + (buffer[1] << 8);
    }

    parseSpO2Data(value) {
        const buffer = new Uint8Array(value.buffer);
        return buffer[0];
    }

    parseTemperatureData(value) {
        const buffer = new Float32Array(value.buffer);
        return buffer[0];
    }

    parseStepData(value) {
        const buffer = new Uint16Array(value.buffer);
        return buffer[0];
    }
}

// Data Simulator for fallback
class HealthDataSimulator {
    constructor(onDataCallback) {
        this.onDataCallback = onDataCallback;
        this.interval = null;
        
        // Base values
        this.currentTemp = 36.5;
        this.currentSteps = 0;
        this.currentSpO2 = 98;
        this.systolic = 120;
        this.diastolic = 80;
        
        // Anomaly timing
        this.lastAnomalyTime = Date.now();
        this.anomalyInterval = 15000; // Create anomaly every 15 seconds
        this.isAnomalyActive = false;
        this.anomalyDuration = 5000; // Anomaly lasts 5 seconds
    }

    start() {
        this.interval = setInterval(() => {
            const currentTime = Date.now();

            // Check if it's time to create or end an anomaly
            if (!this.isAnomalyActive && currentTime - this.lastAnomalyTime > this.anomalyInterval) {
                this.isAnomalyActive = true;
                this.lastAnomalyTime = currentTime;
                setTimeout(() => {
                    this.isAnomalyActive = false;
                }, this.anomalyDuration);
            }

            // Generate PPG signal
            const ppgValue = this.generatePPGValue();
            this.onDataCallback('ppg', ppgValue);

            // Generate BP values with occasional anomalies
            const bpValues = this.generateBPValues();
            this.onDataCallback('bp', bpValues);

            // Generate SpO2 with occasional drops
            const spo2Value = this.generateSpO2Value();
            this.onDataCallback('spo2', spo2Value);

            // Generate Temperature with occasional spikes
            const tempValue = this.generateTemperatureValue();
            this.onDataCallback('temperature', tempValue);

            // Generate Steps
            const stepIncrement = this.generateStepIncrement();
            this.onDataCallback('steps', stepIncrement);

        }, 100);
    }

    generatePPGValue() {
        const time = Date.now() / 1000;
        const baseSignal = Math.sin(time * 1.2 * 2 * Math.PI) * 0.5;
        
        if (this.isAnomalyActive) {
            return baseSignal * 1.5 + Math.random() * 0.3;
        }
        return baseSignal + Math.random() * 0.1;
    }

    generateBPValues() {
        if (this.isAnomalyActive) {
            // Generate elevated BP
            this.systolic = Math.min(160, this.systolic + (Math.random() * 4 - 1));
            this.diastolic = Math.min(100, this.diastolic + (Math.random() * 3 - 1));
        } else {
            // Return to normal gradually
            this.systolic = this.systolic > 120 ? 
                this.systolic - (Math.random() * 2) : 
                120 + (Math.random() * 4 - 2);
            this.diastolic = this.diastolic > 80 ? 
                this.diastolic - (Math.random() * 1.5) : 
                80 + (Math.random() * 3 - 1.5);
        }

        return {
            systolic: Math.round(this.systolic),
            diastolic: Math.round(this.diastolic)
        };
    }

    generateSpO2Value() {
        if (this.isAnomalyActive) {
            // Generate lower SpO2
            this.currentSpO2 = Math.max(93, this.currentSpO2 - (Math.random() * 0.5));
        } else {
            // Return to normal gradually
            this.currentSpO2 = this.currentSpO2 < 98 ? 
                this.currentSpO2 + (Math.random() * 0.3) : 
                98 + (Math.random() * 0.4 - 0.2);
        }
        
        return Math.round(this.currentSpO2);
    }

    generateTemperatureValue() {
        if (this.isAnomalyActive) {
            // Generate elevated temperature
            this.currentTemp = Math.min(37.8, this.currentTemp + (Math.random() * 0.1));
        } else {
            // Return to normal gradually
            this.currentTemp = this.currentTemp > 36.5 ? 
                this.currentTemp - (Math.random() * 0.05) : 
                36.5 + (Math.random() * 0.2 - 0.1);
        }
        
        return this.currentTemp;
    }

    generateStepIncrement() {
        const hourOfDay = new Date().getHours();
        const isActiveHour = hourOfDay >= 7 && hourOfDay <= 22;
        
        if (isActiveHour) {
            if (this.isAnomalyActive) {
                // Generate burst of activity
                this.currentSteps += Math.round(Math.random() * 5);
            } else {
                // Normal activity
                this.currentSteps += Math.random() < 0.3 ? 1 : 0;
            }
        }
        
        return this.currentSteps;
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}

// Updated HealthAIAnalyzer with a one-minute analysis interval
class HealthAIAnalyzer {
    constructor() {
        this.ppgHistory = [];
        this.bpHistory = [];
        this.spo2History = [];
        this.temperatureHistory = [];
        this.stepHistory = [];
        this.lastAnalysis = 0;
        this.analysisInterval = 5000;
    }

    analyze() {
        const insights = [];
        const currentTime = Date.now();

        if (currentTime - this.lastAnalysis < this.analysisInterval) {
            return insights;
        }
        this.lastAnalysis = currentTime;

        // Get latest values
        const latestBP = this.getLatestValue(this.bpHistory);
        const latestSpO2 = this.getLatestValue(this.spo2History);
        const latestTemp = this.getLatestValue(this.temperatureHistory);
        const totalSteps = this.getLatestValue(this.stepHistory);

        if (!latestBP || !latestSpO2 || !latestTemp || !totalSteps) {
            return insights;
        }

        // 1. Physical Stress Analysis
        let stressScore = 0;
        if (latestBP.value.systolic > 130) stressScore += 30;
        if (latestTemp.value > 37.0) stressScore += 20;
        if (totalSteps.value > 8000) stressScore += 20;

        insights.push({
            type: stressScore > 50 ? 'warning' : 'positive',
            metric: 'Physical Stress',
            message: stressScore > 50 
                ? 'High physical stress detected' 
                : 'Normal physical stress levels',
            value: Math.round(stressScore)
        });

        // 2. Sleep Quality Prediction
        const hourOfDay = new Date().getHours();
        let sleepScore = 100;
        
        if (latestTemp.value > 37.2) sleepScore -= 20;
        if (latestBP.value.systolic > 125) sleepScore -= 15;
        if (hourOfDay >= 22 && totalSteps.value > 500) sleepScore -= 25;

        insights.push({
            type: sleepScore < 70 ? 'warning' : 'positive',
            metric: 'Sleep Quality',
            message: sleepScore < 70 
                ? 'Sleep quality might be affected' 
                : 'Good sleep quality predicted',
            value: Math.round(sleepScore)
        });

        // 3. Exercise Recovery Status
        let recoveryScore = 100;
        if (latestBP.value.systolic > 130) recoveryScore -= 20;
        if (latestSpO2.value < 96) recoveryScore -= 30;
        if (totalSteps.value > 10000) recoveryScore -= 20;

        insights.push({
            type: recoveryScore < 60 ? 'warning' : 'positive',
            metric: 'Exercise Recovery',
            message: recoveryScore < 60 
                ? 'Recovery level is low' 
                : 'Good recovery status',
            value: Math.round(recoveryScore)
        });

        // 4. Cardiovascular Risk Assessment
        let cardioRisk = 0;
        if (latestBP.value.systolic > 140) cardioRisk += 40;
        if (latestBP.value.diastolic > 90) cardioRisk += 30;
        if (latestSpO2.value < 95) cardioRisk += 30;

        insights.push({
            type: cardioRisk > 50 ? 'alert' : cardioRisk > 30 ? 'warning' : 'positive',
            metric: 'Cardiovascular Risk',
            message: cardioRisk > 50 
                ? 'Elevated cardiovascular risk' 
                : cardioRisk > 30 
                    ? 'Moderate cardiovascular risk' 
                    : 'Low cardiovascular risk',
            value: Math.round(cardioRisk)
        });

        // 5. Hydration Risk Assessment
        let hydrationRisk = 0;
        if (latestTemp.value > 37.2) hydrationRisk += 30;
        if (latestBP.value.systolic > 130) hydrationRisk += 20;
        if (totalSteps.value > 8000) hydrationRisk += 20;

        insights.push({
            type: hydrationRisk > 40 ? 'warning' : 'positive',
            metric: 'Hydration Risk',
            message: hydrationRisk > 40 
                ? 'Increased risk of dehydration' 
                : 'Hydration levels appear normal',
            value: Math.round(hydrationRisk)
        });

        // 6. Physical Fatigue Analysis
        let fatigueScore = 0;
        if (latestSpO2.value < 96) fatigueScore += 20;
        if (totalSteps.value > 10000) fatigueScore += 30;
        if (latestTemp.value > 37.0) fatigueScore += 20;
        if (latestBP.value.systolic > 130) fatigueScore += 20;

        insights.push({
            type: fatigueScore > 50 ? 'warning' : 'positive',
            metric: 'Physical Fatigue',
            message: fatigueScore > 50 
                ? 'High fatigue level detected' 
                : 'Normal energy levels',
            value: Math.round(fatigueScore)
        });

        // 7. Respiratory Health Analysis
        let respiratoryScore = 100;
        if (latestSpO2.value < 95) respiratoryScore -= 40;
        if (latestSpO2.value < 97) respiratoryScore -= 20;
        if (totalSteps.value > 5000 && latestSpO2.value < 96) respiratoryScore -= 20;

        insights.push({
            type: respiratoryScore < 70 ? 'warning' : 'positive',
            metric: 'Respiratory Health',
            message: respiratoryScore < 70 
                ? 'Respiratory health needs attention' 
                : 'Good respiratory health',
            value: Math.round(respiratoryScore)
        });

        // 8. Overall Health Score
        let overallScore = 100;
        overallScore -= (stressScore / 2);
        overallScore -= ((100 - sleepScore) / 2);
        overallScore -= ((100 - recoveryScore) / 2);
        overallScore -= cardioRisk;
        overallScore -= (hydrationRisk / 2);
        overallScore -= (fatigueScore / 2);
        overallScore -= ((100 - respiratoryScore) / 2);

        overallScore = Math.max(0, Math.min(100, overallScore));

        insights.push({
            type: overallScore < 60 ? 'alert' : overallScore < 80 ? 'warning' : 'positive',
            metric: 'Overall Health',
            message: `Health indicators are ${
                overallScore < 60 ? 'concerning' : 
                overallScore < 80 ? 'moderate' : 'good'
            }`,
            value: Math.round(overallScore)
        });

        return insights;
    }

    addData(type, value) {
        const dataPoint = { value, timestamp: Date.now() };
        
        switch (type) {
            case 'ppg':
                this.ppgHistory.push(dataPoint);
                if (this.ppgHistory.length > 100) this.ppgHistory.shift();
                break;
            case 'bp':
                this.bpHistory.push(dataPoint);
                if (this.bpHistory.length > 50) this.bpHistory.shift();
                break;
            case 'spo2':
                this.spo2History.push(dataPoint);
                if (this.spo2History.length > 20) this.spo2History.shift();
                break;
            case 'temperature':
                this.temperatureHistory.push(dataPoint);
                if (this.temperatureHistory.length > 20) this.temperatureHistory.shift();
                break;
            case 'steps':
                this.stepHistory.push(dataPoint);
                if (this.stepHistory.length > 50) this.stepHistory.shift();
                break;
        }
    }

    getLatestValue(history) {
        return history.length > 0 ? history[history.length - 1] : null;
    }
}

// Updated HealthMonitor to update insights once every minute.
class HealthMonitor {
    constructor() {
        // Initialize data arrays and values
        this.ppgData = Array(50).fill(0);
        this.bpData = {
            systolic: Array(50).fill(120),
            diastolic: Array(50).fill(80)
        };
        this.spo2Value = 98;
        this.temperature = 36.5;
        this.steps = 0;

        // Create instances
        this.aiAnalyzer = new HealthAIAnalyzer();
        this.simulator = new HealthDataSimulator(this.handleData.bind(this));
        this.bleManager = new BLEManager(
            this.handleData.bind(this),
            this.handleConnectionChange.bind(this)
        );

        // Setup and start
        this.setupCharts();
        this.initializeConnection();
        
        // Initialize AI analysis updates
        this.lastAIUpdate = 0;
        this.aiUpdateInterval = 30000; // Update AI insights every 30 seconds

        // Start periodic AI analysis
        setInterval(() => {
            this.performAIAnalysis();
        }, 5000); // Check more frequently, but only update when interval is reached

        // Force initial analysis
        this.performAIAnalysis();
    }

    handleData(type, value) {
        // console.log(`Received data: ${type} = ${value}`); // Debug log
        switch(type) {
            case 'ppg':
                this.ppgData.push(value);
                this.ppgData.shift();
                break;
            case 'bp':
                this.bpData.systolic.push(value.systolic);
                this.bpData.systolic.shift();
                this.bpData.diastolic.push(value.diastolic);
                this.bpData.diastolic.shift();
                break;
            case 'spo2':
                this.spo2Value = value;
                break;
            case 'temperature':
                this.temperature = value;
                break;
            case 'steps':
                this.steps = value;
                break;
        }

        this.updateUI();
        this.aiAnalyzer.addData(type, value);
    }

    updateUI() {
        // Update PPG chart
        if (this.ppgChart) {
            this.ppgChart.data.datasets[0].data = this.ppgData;
            this.ppgChart.update('none');
        }

        // Update BP chart
        if (this.bpChart) {
            this.bpChart.data.datasets[0].data = this.bpData.systolic;
            this.bpChart.data.datasets[1].data = this.bpData.diastolic;
            this.bpChart.update('none');
        }

        // Update display values
        const ppgValue = document.getElementById('ppgValue');
        const systolicValue = document.getElementById('systolicValue');
        const diastolicValue = document.getElementById('diastolicValue');
        const spo2Value = document.getElementById('spo2Value');
        const tempValue = document.getElementById('tempValue');
        const stepValue = document.getElementById('stepValue');

        if (ppgValue) ppgValue.textContent = this.ppgData[this.ppgData.length - 1]?.toFixed(2) || '--';
        if (systolicValue) systolicValue.textContent = this.bpData.systolic[this.bpData.systolic.length - 1] || '--';
        if (diastolicValue) diastolicValue.textContent = this.bpData.diastolic[this.bpData.diastolic.length - 1] || '--';
        if (spo2Value) spo2Value.textContent = Math.round(this.spo2Value) || '--';
        if (tempValue) tempValue.textContent = this.temperature.toFixed(1) || '--';
        if (stepValue) stepValue.textContent = this.steps || '0';
    }

    async initializeConnection() {
        try {
            await this.bleManager.connect();
        } catch (error) {
            console.log('Falling back to simulated data');
            this.simulator.start(); // Start simulator if BLE fails
        }
    }

    handleConnectionChange(isConnected, fallbackToSimulation) {
        const connectionIcon = document.getElementById('connectionIcon');
        const connectionText = document.getElementById('connectionText');
        
        if (connectionIcon) {
            connectionIcon.textContent = isConnected ? '⬤' : '⭘';
            connectionIcon.style.color = isConnected ? '#4CAF50' : '#FF5252';
        }
        
        if (connectionText) {
            connectionText.textContent = isConnected ? 'Connected' : 'Disconnected';
        }

        if (!isConnected && fallbackToSimulation) {
            this.simulator.start();
        }
    }

    setupCharts() {
        // PPG Chart setup
        const ppgCtx = document.getElementById('ppgChart').getContext('2d');
        this.ppgChart = new Chart(ppgCtx, {
            type: 'line',
            data: {
                labels: Array(50).fill(''),
                datasets: [{
                    label: 'PPG Signal',
                    data: this.ppgData,
                    borderColor: '#2196F3',
                    borderWidth: 3,
                    pointRadius: 0,
                    tension: 0.4,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                animation: false,
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Time (seconds)',
                            color: '#666',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            display: false // hide individual tick labels
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Amplitude (mV)',
                            color: '#666',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        min: -1.5,
                        max: 1.5,
                        ticks: {
                            color: '#000',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)',
                        },
                    },
                },
                plugins: {
                    legend: {
                        display: false,
                    },
                },
            },
        });

        // BP Chart setup
        const bpCtx = document.getElementById('bpChart').getContext('2d');
        this.bpChart = new Chart(bpCtx, {
            type: 'line',
            data: {
                labels: Array(50).fill(''),
                datasets: [
                    {
                        label: 'Systolic',
                        data: this.bpData.systolic,
                        borderColor: '#ff6384',
                        borderWidth: 3,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Diastolic',
                        data: this.bpData.diastolic,
                        borderColor: '#36a2eb',
                        borderWidth: 3,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                animation: false,
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Time (seconds)',
                            color: '#666',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            display: false
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Blood Pressure (mmHg)',
                            color: '#666',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        min: 40,
                        max: 160,
                        ticks: {
                            color: '#000',
                            font: {
                                size: 12,
                                weight: 'bold'
                            },
                            stepSize: 20
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)',
                        },
                    },
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            boxWidth: 20,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        }
                    },
                },
            },
        });
    }

    performAIAnalysis() {
        const currentTime = Date.now();
        if (currentTime - this.lastAIUpdate >= this.aiUpdateInterval) {
            console.log('Performing AI analysis');
            const insights = this.aiAnalyzer.analyze();
            const insightsList = document.getElementById('insightsList');

            if (!insightsList) {
                console.error('Could not find insightsList element');
                return;
            }

            // If no insights are generated, show a default message
            if (!insights || insights.length === 0) {
                insights = [{
                    type: 'positive',
                    metric: 'Status',
                    message: 'Monitoring your health data. More insights will appear as data is collected.'
                }];
            }

            // Update the insights display
            insightsList.innerHTML = insights
                .map(
                    (insight) => `
                <li class="${insight.type}">
                    <strong>${insight.metric}:</strong> ${insight.message}
                    ${insight.value ? ` (${typeof insight.value === 'number' ? insight.value.toFixed(1) : insight.value})` : ''}
                </li>`
                )
                .join('');

            this.lastAIUpdate = currentTime;
            console.log('Updated insights:', insights);
        }
    }
}

// Ensure HealthMonitor is created after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const healthMonitor = new HealthMonitor();
});
