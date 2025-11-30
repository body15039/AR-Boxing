// AR Boxing Game
class BoxingGame {
    constructor() {
        this.score = 0;
        this.timeLeft = 60;
        this.gameActive = false;
        this.gameSpeed = 1.0;
        this.spawnRate = 2.0;
        this.lastSpawnTime = 0;
        this.objects = [];
        this.particles = [];
        
        // Hand tracking
        this.detector = null;
        this.hands = [];
        this.lastPunchTime = 0;
        this.punchCooldown = 300; // ms
        
        // Three.js
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        this.initialized = false;
        
        console.log('Game constructor initialized');
    }

    async init() {
        console.log('Starting game initialization...');
        
        try {
            await this.setupCamera();
            await this.setupThreeJS();
            this.setupEventListeners();
            
            // Try to setup hand tracking but don't block game start
            this.setupHandTracking().catch(error => {
                console.warn('Hand tracking failed, but game will continue:', error);
                this.showMessage('Hand tracking not available, but you can still play!');
            });
            
            this.initialized = true;
            console.log('Game initialized successfully');
            
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showError('Failed to initialize game: ' + error.message);
        }
    }

    async setupCamera() {
        const video = document.getElementById('videoElement');
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
            video.srcObject = stream;
            
            return new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    video.play();
                    console.log('Camera access granted');
                    resolve();
                };
            });
        } catch (err) {
            console.error('Camera error:', err);
            this.showError('Cannot access camera. Please allow camera permissions and refresh the page.');
            throw err;
        }
    }

    async setupHandTracking() {
        console.log('Loading hand tracking model...');
        const loadingMessage = document.getElementById('loadingMessage');
        loadingMessage.style.display = 'block';
        
        try {
            // Check if TensorFlow.js is loaded
            if (typeof handPoseDetection === 'undefined') {
                throw new Error('Hand pose detection library not loaded');
            }
            
            const model = handPoseDetection.SupportedModels.MediaPipeHands;
            const detectorConfig = {
                runtime: 'tfjs',
                modelType: 'lite',
                maxHands: 2
            };
            
            this.detector = await handPoseDetection.createDetector(model, detectorConfig);
            console.log('Hand tracking model loaded successfully');
            loadingMessage.style.display = 'none';
            
        } catch (error) {
            console.warn('Hand tracking failed:', error);
            loadingMessage.style.display = 'none';
            throw error;
        }
    }

    setupThreeJS() {
        console.log('Setting up Three.js...');
        const canvas = document.getElementById('canvas3d');
        
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = null;
        
        // Camera
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
        this.camera.position.z = 5;
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 2);
        this.scene.add(directionalLight);
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        console.log('Three.js setup complete');
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        const startButton = document.getElementById('startButton');
        const restartButton = document.getElementById('restartButton');
        
        if (startButton) {
            startButton.addEventListener('click', () => this.startGame());
            startButton.disabled = false;
        } else {
            console.error('Start button not found!');
        }
        
        if (restartButton) {
            restartButton.addEventListener('click', () => this.restartGame());
        }
        
        console.log('Event listeners setup complete');
    }

    onWindowResize() {
        if (this.camera && this.renderer) {
            const canvas = this.renderer.domElement;
            this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        }
    }

    startGame() {
        console.log('Starting game...');
        
        if (!this.initialized) {
            console.error('Game not initialized yet');
            return;
        }
        
        this.score = 0;
        this.timeLeft = 60;
        this.gameActive = true;
        this.gameSpeed = 1.0;
        this.spawnRate = 2.0;
        this.objects = [];
        this.particles = [];
        
        // Hide start screen, show game
        document.getElementById('startScreen').style.display = 'none';
        document.getElementById('gameOverScreen').style.display = 'none';
        document.getElementById('errorMessage').style.display = 'none';
        
        this.updateUI();
        
        // Start game loop if not already running
        if (!this.gameLoopRunning) {
            this.gameLoopRunning = true;
            this.gameLoop();
        }
        
        console.log('Game started successfully');
    }

    restartGame() {
        this.startGame();
    }

    async gameLoop() {
        if (!this.gameActive) {
            this.gameLoopRunning = false;
            return;
        }
        
        try {
            await this.updateGameState();
            this.renderScene();
        } catch (error) {
            console.error('Game loop error:', error);
        }
        
        requestAnimationFrame(() => this.gameLoop());
    }

    async updateGameState() {
        if (!this.gameActive) return;
        
        // Update timer
        this.timeLeft -= 1/60;
        if (this.timeLeft <= 0) {
            this.endGame();
            return;
        }
        
        // Increase difficulty
        this.gameSpeed = 1.0 + (60 - this.timeLeft) * 0.02;
        this.spawnRate = Math.max(0.5, 2.0 - (60 - this.timeLeft) * 0.02);
        
        // Spawn objects
        const currentTime = performance.now() / 1000;
        if (currentTime - this.lastSpawnTime > this.spawnRate) {
            this.createObject();
            this.lastSpawnTime = currentTime;
        }
        
        // Detect hands if available
        if (this.detector) {
            await this.detectHands();
            this.checkCollisions();
        }
        
        // Update physics
        this.updatePhysics();
        this.updateUI();
    }

    async detectHands() {
        if (!this.detector) return;
        
        try {
            const video = document.getElementById('videoElement');
            this.hands = await this.detector.estimateHands(video);
        } catch (error) {
            console.warn('Hand detection error:', error);
        }
    }

    createObject() {
        const objectTypes = [
            { type: 'normal', color: 0x00ff88, points: 10, radius: 0.3 },
            { type: 'bonus', color: 0xffaa00, points: 50, radius: 0.2 },
            { type: 'danger', color: 0xff4444, points: -20, radius: 0.4 }
        ];
        
        const type = objectTypes[Math.floor(Math.random() * objectTypes.length)];
        const geometry = new THREE.SphereGeometry(type.radius, 16, 16);
        const material = new THREE.MeshPhongMaterial({ 
            color: type.color,
            emissive: type.color,
            emissiveIntensity: 0.5
        });
        
        const object = new THREE.Mesh(geometry, material);
        
        // Random position
        object.position.x = (Math.random() - 0.5) * 6;
        object.position.y = (Math.random() - 0.5) * 4 + 1;
        object.position.z = -8;
        
        object.userData = {
            type: type.type,
            points: type.points,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.05,
                (Math.random() - 0.5) * 0.05,
                this.gameSpeed * 0.1
            )
        };
        
        this.scene.add(object);
        this.objects.push(object);
    }

    checkCollisions() {
        const currentTime = performance.now();
        
        this.hands.forEach(hand => {
            const indexFinger = hand.keypoints.find(point => point.name === 'index_finger_tip');
            const wrist = hand.keypoints.find(point => point.name === 'wrist');
            
            if (!indexFinger || !wrist) return;
            
            // Simple punch detection based on finger movement
            const punchVelocity = Math.sqrt(
                Math.pow(indexFinger.x - wrist.x, 2) + 
                Math.pow(indexFinger.y - wrist.y, 2)
            );
            
            if (punchVelocity > 20 && currentTime - this.lastPunchTime > this.punchCooldown) {
                this.lastPunchTime = currentTime;
                
                // Convert screen coordinates to 3D
                const screenX = (indexFinger.x / window.innerWidth) * 2 - 1;
                const screenY = -(indexFinger.y / window.innerHeight) * 2 + 1;
                
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(new THREE.Vector2(screenX, screenY), this.camera);
                
                const intersects = raycaster.intersectObjects(this.objects);
                
                if (intersects.length > 0) {
                    const object = intersects[0].object;
                    this.hitObject(object);
                }
            }
        });
    }

    hitObject(object) {
        const userData = object.userData;
        
        // Update score
        this.score += userData.points;
        this.score = Math.max(0, this.score);
        
        // Create simple particle effect
        this.createParticleEffect(object.position, userData.type);
        
        // Remove object
        this.scene.remove(object);
        this.objects = this.objects.filter(obj => obj !== object);
        
        console.log('Object hit! Score:', this.score);
    }

    createParticleEffect(position, type) {
        const particleCount = 15;
        const color = type === 'normal' ? 0x00ff88 : 
                     type === 'bonus' ? 0xffaa00 : 0xff4444;
        
        for (let i = 0; i < particleCount; i++) {
            const geometry = new THREE.SphereGeometry(0.05, 8, 8);
            const material = new THREE.MeshBasicMaterial({ color: color });
            
            const particle = new THREE.Mesh(geometry, material);
            particle.position.copy(position);
            
            particle.userData = {
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.1,
                    (Math.random() - 0.5) * 0.1,
                    (Math.random() - 0.5) * 0.1
                ),
                life: 1.0
            };
            
            this.scene.add(particle);
            this.particles.push(particle);
        }
    }

    updatePhysics() {
        // Update objects
        this.objects.forEach(object => {
            const userData = object.userData;
            object.position.add(userData.velocity);
            
            // Remove objects that are too close
            if (object.position.z > 2) {
                this.scene.remove(object);
                this.objects = this.objects.filter(obj => obj !== object);
            }
        });
        
        // Update particles
        this.particles.forEach((particle, index) => {
            const userData = particle.userData;
            particle.position.add(userData.velocity);
            userData.life -= 0.03;
            particle.scale.setScalar(userData.life);
            
            if (userData.life <= 0) {
                this.scene.remove(particle);
                this.particles.splice(index, 1);
            }
        });
    }

    renderScene() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    updateUI() {
        document.getElementById('scoreValue').textContent = this.score;
        document.getElementById('timerValue').textContent = Math.max(0, Math.ceil(this.timeLeft));
    }

    endGame() {
        this.gameActive = false;
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('gameOverScreen').style.display = 'block';
        
        // Clear objects
        this.objects.forEach(object => this.scene.remove(object));
        this.objects = [];
        this.particles.forEach(particle => this.scene.remove(particle));
        this.particles = [];
        
        console.log('Game ended. Final score:', this.score);
    }

    showError(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorMessage').style.display = 'block';
        document.getElementById('startScreen').style.display = 'none';
    }

    showMessage(message) {
        // You can implement a temporary message display here
        console.log('Game Message:', message);
    }
}

// Initialize game when page loads
let game;
window.addEventListener('load', () => {
    console.log('Page loaded, initializing game...');
    game = new BoxingGame();
    game.init().then(() => {
        console.log('Game ready!');
    }).catch(error => {
        console.error('Game failed to initialize:', error);
    });
});
