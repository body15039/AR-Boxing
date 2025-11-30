// AR Boxing Game with Working Hand Tracking
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
        this.punchCooldown = 300;
        
        // Three.js
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        this.handTrackingReady = false;
        
        console.log('🎮 AR Boxing Game Initialized');
    }

    async init() {
        console.log('🚀 Starting game initialization...');
        
        try {
            await this.setupCamera();
            this.setupThreeJS();
            this.setupEventListeners();
            
            // Try to initialize hand tracking, but don't block the game
            this.initializeHandTracking().then(() => {
                console.log('✅ Hand tracking ready!');
            }).catch(error => {
                console.warn('⚠️ Hand tracking failed, using fallback mode:', error);
                this.showMessage('Hand tracking not available. Use SPACE key to punch!');
            });
            
            console.log('✅ Game ready!');
            
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            this.showError('Game loaded! Make punching motions or press SPACE key.');
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
                    console.log('📷 Camera ready');
                    resolve();
                };
            });
            
        } catch (err) {
            console.warn('📷 Camera not available:', err);
            this.showMessage('Camera not available. Use SPACE key to punch objects!');
            // Don't throw error - game continues without camera
        }
    }

    async initializeHandTracking() {
        console.log('🔄 Loading hand tracking...');
        
        // Check if handPoseDetection is available
        if (typeof handPoseDetection === 'undefined') {
            throw new Error('Hand pose detection library not loaded');
        }
        
        try {
            // Use a simpler approach - skip TensorFlow.js version checks
            const model = handPoseDetection.SupportedModels.MediaPipeHands;
            this.detector = await handPoseDetection.createDetector(model, {
                runtime: 'mediapipe', // Use mediapipe instead of tfjs
                modelType: 'lite',
                maxHands: 2,
                solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/'
            });
            
            this.handTrackingReady = true;
            console.log('✅ Hand tracking model loaded');
            
        } catch (error) {
            console.error('❌ Hand tracking failed:', error);
            throw error;
        }
    }

    setupThreeJS() {
        const canvas = document.getElementById('canvas3d');
        
        this.scene = new THREE.Scene();
        this.scene.background = null;
        
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
        this.camera.position.z = 5;
        
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
        
        window.addEventListener('resize', () => this.onWindowResize());
        console.log('✅ 3D environment ready');
    }

    setupEventListeners() {
        document.getElementById('startButton').addEventListener('click', () => this.startGame());
        document.getElementById('restartButton').addEventListener('click', () => this.restartGame());
        
        // Fallback: Space bar to simulate punches
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Space' && this.gameActive) {
                this.simulatePunch();
            }
        });
        
        // Click fallback
        document.addEventListener('click', (event) => {
            if (this.gameActive) {
                this.simulatePunchAtPosition(event.clientX, event.clientY);
            }
        });
    }

    startGame() {
        console.log('🥊 Starting game!');
        
        this.score = 0;
        this.timeLeft = 60;
        this.gameActive = true;
        this.gameSpeed = 1.0;
        this.spawnRate = 2.0;
        this.objects = [];
        this.particles = [];
        
        document.getElementById('startScreen').style.display = 'none';
        document.getElementById('gameOverScreen').style.display = 'none';
        document.getElementById('errorMessage').style.display = 'none';
        
        this.updateUI();
        this.gameLoop();
        
        console.log('✅ Game started!');
    }

    restartGame() {
        this.startGame();
    }

    async gameLoop() {
        if (!this.gameActive) return;
        
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
        
        // Timer
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
        
        // Hand tracking (if available)
        if (this.handTrackingReady && this.detector) {
            await this.detectHands();
            this.checkCollisions();
        }
        
        this.updatePhysics();
        this.updateUI();
    }

    async detectHands() {
        if (!this.detector) return;
        
        try {
            const video = document.getElementById('videoElement');
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                this.hands = await this.detector.estimateHands(video, { flipHorizontal: true });
            }
        } catch (error) {
            console.warn('Hand detection error:', error);
        }
    }

    checkCollisions() {
        const currentTime = performance.now();
        
        this.hands.forEach(hand => {
            const indexTip = hand.keypoints.find(point => point.name === 'index_finger_tip');
            const wrist = hand.keypoints.find(point => point.name === 'wrist');
            
            if (!indexTip || !wrist) return;
            
            // Simple punch detection - check distance from wrist
            const distance = Math.sqrt(
                Math.pow(indexTip.x - wrist.x, 2) + 
                Math.pow(indexTip.y - wrist.y, 2)
            );
            
            // If hand is extended and enough time passed since last punch
            if (distance > 40 && currentTime - this.lastPunchTime > this.punchCooldown) {
                this.lastPunchTime = currentTime;
                this.detectPunchCollision(indexTip.x, indexTip.y);
            }
        });
    }

    detectPunchCollision(handX, handY) {
        // Convert screen coordinates to 3D
        const screenX = (handX / window.innerWidth) * 2 - 1;
        const screenY = -(handY / window.innerHeight) * 2 + 1;
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(screenX, screenY), this.camera);
        
        const intersects = raycaster.intersectObjects(this.objects);
        
        if (intersects.length > 0) {
            this.hitObject(intersects[0].object);
        }
    }

    createObject() {
        const types = [
            { type: 'normal', color: 0x00ff88, points: 10, radius: 0.4 },
            { type: 'bonus', color: 0xffaa00, points: 50, radius: 0.3 },
            { type: 'danger', color: 0xff4444, points: -20, radius: 0.5 },
            { type: 'explosive', color: 0xaa00ff, points: 30, radius: 0.35 }
        ];
        
        const type = types[Math.floor(Math.random() * types.length)];
        const geometry = new THREE.SphereGeometry(type.radius, 32, 32);
        const material = new THREE.MeshPhongMaterial({ 
            color: type.color,
            emissive: type.color,
            emissiveIntensity: 0.3
        });
        
        const object = new THREE.Mesh(geometry, material);
        
        object.position.set(
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 4 + 1,
            -10
        );
        
        object.userData = {
            type: type.type,
            points: type.points,
            velocity: new THREE.Vector3(0, 0, this.gameSpeed * 0.1)
        };
        
        this.scene.add(object);
        this.objects.push(object);
        
        return object;
    }

    hitObject(object) {
        const points = object.userData.points;
        this.score += points;
        this.score = Math.max(0, this.score);
        
        console.log(`💥 Hit ${object.userData.type} object! +${points} points`);
        
        // Create particles
        this.createParticles(object.position, object.userData.type);
        
        // Remove object
        this.scene.remove(object);
        this.objects = this.objects.filter(obj => obj !== object);
        
        this.updateUI();
    }

    createParticles(position, type) {
        const colors = {
            normal: 0x00ff88,
            bonus: 0xffaa00,
            danger: 0xff4444,
            explosive: 0xaa00ff
        };
        
        const color = colors[type] || 0xffffff;
        const particleCount = 20;
        
        for (let i = 0; i < particleCount; i++) {
            const size = 0.03 + Math.random() * 0.07;
            const geometry = new THREE.SphereGeometry(size, 8, 8);
            const material = new THREE.MeshBasicMaterial({ 
                color: color,
                transparent: true
            });
            
            const particle = new THREE.Mesh(geometry, material);
            particle.position.copy(position);
            
            particle.userData = {
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.2,
                    (Math.random() - 0.5) * 0.2,
                    (Math.random() - 0.5) * 0.2
                ),
                life: 1.0
            };
            
            this.scene.add(particle);
            this.particles.push(particle);
        }
    }

    updatePhysics() {
        // Move objects
        this.objects.forEach((object, index) => {
            object.position.add(object.userData.velocity);
            object.rotation.x += 0.01;
            object.rotation.y += 0.01;
            
            if (object.position.z > 2) {
                this.scene.remove(object);
                this.objects.splice(index, 1);
            }
        });
        
        // Update particles
        this.particles.forEach((particle, index) => {
            particle.position.add(particle.userData.velocity);
            particle.userData.life -= 0.03;
            particle.material.opacity = particle.userData.life;
            particle.scale.setScalar(particle.userData.life);
            
            if (particle.userData.life <= 0) {
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
        document.getElementById('timerValue').textContent = Math.ceil(this.timeLeft);
    }

    endGame() {
        this.gameActive = false;
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('gameOverScreen').style.display = 'block';
        
        this.objects.forEach(obj => this.scene.remove(obj));
        this.particles.forEach(particle => this.scene.remove(particle));
        this.objects = [];
        this.particles = [];
    }

    simulatePunch() {
        // Simulate punch at random position
        const randomX = Math.random() * window.innerWidth;
        const randomY = Math.random() * window.innerHeight;
        this.simulatePunchAtPosition(randomX, randomY);
    }

    simulatePunchAtPosition(x, y) {
        this.detectPunchCollision(x, y);
    }

    showError(message) {
        console.error('❌ ' + message);
    }

    showMessage(message) {
        console.log('💡 ' + message);
    }
}

// Initialize game when page loads
window.addEventListener('load', () => {
    console.log('🚀 Loading AR Boxing Game...');
    window.game = new BoxingGame();
    game.init();
});
