// AR Boxing Game - Perfect Hand Tracking
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
        
        // Enhanced hand tracking
        this.detector = null;
        this.hands = [];
        this.lastPunchTime = 0;
        this.punchCooldown = 200; // ms
        this.punchThreshold = 25; // Minimum movement speed for punch
        
        // Three.js
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // Hand position history for velocity calculation
        this.handHistory = {
            left: { x: 0, y: 0, time: 0 },
            right: { x: 0, y: 0, time: 0 }
        };
        
        // Collision detection
        this.punchRange = 0.8; // How close objects need to be to punch
        
        this.initialized = false;
        this.gameLoopRunning = false;
        
        console.log('🎮 AR Boxing Game Initialized');
    }

    async init() {
        console.log('🚀 Starting game initialization...');
        
        try {
            await this.setupCamera();
            await this.setupThreeJS();
            this.setupEventListeners();
            
            // Setup hand tracking in background
            this.setupHandTracking().catch(error => {
                console.warn('Hand tracking failed:', error);
                this.showMessage('Hand tracking not available. Using fallback detection.');
            });
            
            this.initialized = true;
            console.log('✅ Game initialized successfully');
            
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            this.showError('Failed to initialize: ' + error.message);
        }
    }

    async setupCamera() {
        const video = document.getElementById('videoElement');
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            video.srcObject = stream;
            
            return new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    video.play();
                    console.log('📷 Camera access granted');
                    resolve();
                };
            });
        } catch (err) {
            console.error('📷 Camera error:', err);
            this.showError('Camera access required! Please allow camera permissions.');
            throw err;
        }
    }

    async setupHandTracking() {
        console.log('🔄 Loading hand tracking model...');
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) loadingMessage.style.display = 'block';
        
        try {
            // Wait for TensorFlow.js to be ready
            await tf.ready();
            console.log('✅ TensorFlow.js ready');
            
            const model = handPoseDetection.SupportedModels.MediaPipeHands;
            const detectorConfig = {
                runtime: 'tfjs',
                modelType: 'full',
                maxHands: 2
            };
            
            this.detector = await handPoseDetection.createDetector(model, detectorConfig);
            console.log('✅ Hand tracking model loaded');
            if (loadingMessage) loadingMessage.style.display = 'none';
            
        } catch (error) {
            console.error('❌ Hand tracking failed:', error);
            if (loadingMessage) loadingMessage.style.display = 'none';
            throw error;
        }
    }

    setupThreeJS() {
        console.log('🎨 Setting up 3D environment...');
        const canvas = document.getElementById('canvas3d');
        
        // Scene with fog for depth
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x000000, 5, 15);
        
        // Camera
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
        this.camera.position.set(0, 0, 5);
        
        // Enhanced Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Enhanced Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);
        
        // Point light for object glow
        const pointLight = new THREE.PointLight(0xffffff, 0.5, 10);
        pointLight.position.set(0, 0, 3);
        this.scene.add(pointLight);
        
        window.addEventListener('resize', () => this.onWindowResize());
        console.log('✅ 3D environment ready');
    }

    setupEventListeners() {
        console.log('🔗 Setting up event listeners...');
        
        const startButton = document.getElementById('startButton');
        const restartButton = document.getElementById('restartButton');
        
        if (startButton) {
            startButton.addEventListener('click', () => this.startGame());
            startButton.disabled = false;
        }
        
        if (restartButton) {
            restartButton.addEventListener('click', () => this.restartGame());
        }
        
        // Keyboard fallback for testing
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Space' && this.gameActive) {
                this.simulatePunch();
            }
        });
        
        console.log('✅ Event listeners ready');
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
        console.log('🥊 Starting game...');
        
        if (!this.initialized) {
            this.showError('Game not ready yet. Please wait for initialization.');
            return;
        }
        
        this.score = 0;
        this.timeLeft = 60;
        this.gameActive = true;
        this.gameSpeed = 1.0;
        this.spawnRate = 2.0;
        this.objects = [];
        this.particles = [];
        
        // UI updates
        document.getElementById('startScreen').style.display = 'none';
        document.getElementById('gameOverScreen').style.display = 'none';
        document.getElementById('errorMessage').style.display = 'none';
        
        this.updateUI();
        
        // Start game loop
        if (!this.gameLoopRunning) {
            this.gameLoopRunning = true;
            this.gameLoop();
        }
        
        console.log('✅ Game started!');
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
        const timeElapsed = 60 - this.timeLeft;
        this.gameSpeed = 1.0 + timeElapsed * 0.03;
        this.spawnRate = Math.max(0.3, 2.0 - timeElapsed * 0.03);
        
        // Spawn objects
        const currentTime = performance.now() / 1000;
        if (currentTime - this.lastSpawnTime > this.spawnRate) {
            this.createObject();
            this.lastSpawnTime = currentTime;
        }
        
        // Hand tracking and collision detection
        await this.detectHands();
        this.checkCollisions();
        
        // Update physics
        this.updatePhysics();
        this.updateUI();
    }

    async detectHands() {
        if (!this.detector) return;
        
        try {
            const video = document.getElementById('videoElement');
            this.hands = await this.detector.estimateHands(video, { flipHorizontal: true });
        } catch (error) {
            console.warn('Hand detection error:', error);
        }
    }

    createObject() {
        const objectTypes = [
            { 
                type: 'normal', 
                color: 0x00ff88, 
                points: 10, 
                radius: 0.3,
                glow: true
            },
            { 
                type: 'bonus', 
                color: 0xffaa00, 
                points: 50, 
                radius: 0.2,
                glow: true
            },
            { 
                type: 'danger', 
                color: 0xff4444, 
                points: -20, 
                radius: 0.4,
                glow: false
            },
            { 
                type: 'explosive', 
                color: 0xaa00ff, 
                points: 30, 
                radius: 0.35,
                glow: true
            }
        ];
        
        const type = objectTypes[Math.floor(Math.random() * objectTypes.length)];
        
        // Create glowing material
        const material = new THREE.MeshPhongMaterial({ 
            color: type.color,
            emissive: type.glow ? type.color : 0x000000,
            emissiveIntensity: type.glow ? 0.8 : 0,
            shininess: 100,
            transparent: true,
            opacity: 0.9
        });
        
        const geometry = new THREE.SphereGeometry(type.radius, 32, 32);
        const object = new THREE.Mesh(geometry, material);
        
        // Random position in front of player
        object.position.set(
            (Math.random() - 0.5) * 8, // X: -4 to +4
            Math.random() * 3 + 0.5,   // Y: 0.5 to 3.5
            -15                        // Z: Start far away
        );
        
        object.userData = {
            type: type.type,
            points: type.points,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.08,
                (Math.random() - 0.5) * 0.08,
                this.gameSpeed * 0.15 + Math.random() * 0.05
            ),
            rotationSpeed: new THREE.Vector3(
                Math.random() * 0.02 - 0.01,
                Math.random() * 0.02 - 0.01,
                Math.random() * 0.02 - 0.01
            ),
            hit: false
        };
        
        this.scene.add(object);
        this.objects.push(object);
    }

    checkCollisions() {
        const currentTime = performance.now();
        
        this.hands.forEach((hand, handIndex) => {
            const indexTip = hand.keypoints.find(point => point.name === 'index_finger_tip');
            const thumbTip = hand.keypoints.find(point => point.name === 'thumb_tip');
            const wrist = hand.keypoints.find(point => point.name === 'wrist');
            
            if (!indexTip || !thumbTip || !wrist) return;
            
            // Calculate hand position (average of index and thumb)
            const handX = (indexTip.x + thumbTip.x) / 2;
            const handY = (indexTip.y + thumbTip.y) / 2;
            
            // Calculate punch velocity
            const handKey = handIndex === 0 ? 'left' : 'right';
            const currentTime = performance.now();
            const timeDiff = currentTime - this.handHistory[handKey].time;
            
            if (timeDiff > 0) {
                const velocityX = Math.abs(handX - this.handHistory[handKey].x) / timeDiff * 1000;
                const velocityY = Math.abs(handY - this.handHistory[handKey].y) / timeDiff * 1000;
                const totalVelocity = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
                
                // Update hand history
                this.handHistory[handKey] = { x: handX, y: handY, time: currentTime };
                
                // Check if this is a punch (fast movement)
                if (totalVelocity > this.punchThreshold && 
                    currentTime - this.lastPunchTime > this.punchCooldown) {
                    
                    this.lastPunchTime = currentTime;
                    this.detectPunchCollision(handX, handY, totalVelocity);
                }
            }
        });
    }

    detectPunchCollision(handX, handY, velocity) {
        // Convert screen coordinates to normalized device coordinates (-1 to +1)
        const ndcX = (handX / window.innerWidth) * 2 - 1;
        const ndcY = -(handY / window.innerHeight) * 2 + 1;
        
        // Create raycaster from camera through the hand position
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
        
        // Check intersection with objects
        const intersects = raycaster.intersectObjects(this.objects);
        
        if (intersects.length > 0) {
            const object = intersects[0].object;
            if (!object.userData.hit) {
                this.hitObject(object, velocity);
            }
        } else {
            // Fallback: check distance-based collision
            this.checkDistanceCollision(ndcX, ndcY);
        }
    }

    checkDistanceCollision(ndcX, ndcY) {
        // Convert NDC to world position at object distance
        const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
        vector.unproject(this.camera);
        const dir = vector.sub(this.camera.position).normalize();
        
        // Check all objects for proximity
        this.objects.forEach(object => {
            if (object.userData.hit) return;
            
            const distance = this.camera.position.distanceTo(object.position);
            const punchPos = this.camera.position.clone().add(dir.multiplyScalar(distance));
            const objectDistance = punchPos.distanceTo(object.position);
            
            if (objectDistance < this.punchRange) {
                this.hitObject(object, 50); // Default velocity for distance hits
            }
        });
    }

    hitObject(object, velocity) {
        const userData = object.userData;
        userData.hit = true;
        
        // Calculate score with velocity bonus
        const velocityBonus = Math.min(2.0, velocity / this.punchThreshold);
        const points = Math.round(userData.points * velocityBonus);
        this.score += points;
        this.score = Math.max(0, this.score);
        
        console.log(`💥 Hit ${userData.type} object! +${points} points (velocity: ${velocity.toFixed(1)})`);
        
        // Visual and audio feedback
        this.createExplosionEffect(object.position, userData.type, velocity);
        this.createScorePopup(object.position, points);
        
        // Remove object
        this.scene.remove(object);
        this.objects = this.objects.filter(obj => obj !== object);
        
        this.updateUI();
    }

    createExplosionEffect(position, type, velocity) {
        const particleCount = Math.min(50, 20 + velocity / 2);
        const colors = {
            normal: [0x00ff88, 0x88ffaa],
            bonus: [0xffaa00, 0xffdd00],
            danger: [0xff4444, 0xff8888],
            explosive: [0xaa00ff, 0xff00ff]
        };
        
        const typeColors = colors[type] || [0xffffff, 0xcccccc];
        
        for (let i = 0; i < particleCount; i++) {
            const size = 0.02 + Math.random() * 0.08;
            const geometry = new THREE.SphereGeometry(size, 8, 8);
            const material = new THREE.MeshBasicMaterial({ 
                color: typeColors[Math.floor(Math.random() * typeColors.length)],
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(geometry, material);
            particle.position.copy(position);
            
            // Enhanced particle physics
            const speed = 0.1 + (velocity / this.punchThreshold) * 0.2;
            const angle = Math.random() * Math.PI * 2;
            const power = Math.random() * speed;
            
            particle.userData = {
                velocity: new THREE.Vector3(
                    Math.cos(angle) * power,
                    Math.sin(angle) * power,
                    (Math.random() - 0.5) * power
                ),
                life: 1.0,
                decay: 0.02 + Math.random() * 0.03
            };
            
            this.scene.add(particle);
            this.particles.push(particle);
        }
        
        // Flash effect
        this.createFlashEffect(position, typeColors[0]);
    }

    createFlashEffect(position, color) {
        const flashGeometry = new THREE.SphereGeometry(1, 16, 16);
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.6
        });
        
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.copy(position);
        flash.userData = { life: 1.0 };
        
        this.scene.add(flash);
        this.particles.push(flash);
    }

    createScorePopup(position, points) {
        // Create a floating text element (simplified version)
        console.log(`🎯 +${points} points!`);
        
        // You could enhance this with actual 3D text using Three.js TextGeometry
        // For now, we'll just log to console
    }

    updatePhysics() {
        const deltaTime = 1/60; // Assume 60 FPS
        
        // Update objects with smooth movement
        this.objects.forEach(object => {
            const userData = object.userData;
            
            // Apply velocity
            object.position.x += userData.velocity.x * deltaTime;
            object.position.y += userData.velocity.y * deltaTime;
            object.position.z += userData.velocity.z * deltaTime;
            
            // Apply rotation
            object.rotation.x += userData.rotationSpeed.x;
            object.rotation.y += userData.rotationSpeed.y;
            object.rotation.z += userData.rotationSpeed.z;
            
            // Pulsing effect for certain objects
            if (userData.type === 'bonus' || userData.type === 'explosive') {
                object.scale.setScalar(1 + Math.sin(Date.now() * 0.005) * 0.2);
            }
            
            // Remove objects that are too close or passed by
            if (object.position.z > 2) {
                this.scene.remove(object);
                this.objects = this.objects.filter(obj => obj !== object);
            }
        });
        
        // Update particles with enhanced physics
        this.particles.forEach((particle, index) => {
            const userData = particle.userData;
            
            // Apply velocity with air resistance
            userData.velocity.multiplyScalar(0.98);
            particle.position.add(userData.velocity);
            
            // Apply gravity to non-flash particles
            if (particle.geometry.parameters.radius < 0.5) {
                userData.velocity.y -= 0.01;
            }
            
            // Life decay
            userData.life -= userData.decay || 0.03;
            particle.material.opacity = userData.life * 0.8;
            particle.scale.setScalar(userData.life);
            
            // Remove dead particles
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
        
        // Visual feedback for score changes
        const scoreElement = document.getElementById('scoreValue');
        scoreElement.style.transform = 'scale(1.2)';
        setTimeout(() => {
            scoreElement.style.transform = 'scale(1)';
        }, 200);
    }

    endGame() {
        this.gameActive = false;
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('gameOverScreen').style.display = 'block';
        
        // Clear all objects and particles
        this.objects.forEach(object => this.scene.remove(object));
        this.objects = [];
        this.particles.forEach(particle => this.scene.remove(particle));
        this.particles = [];
        
        console.log(`🎮 Game Over! Final Score: ${this.score}`);
    }

    // Fallback punch simulation for testing
    simulatePunch() {
        if (!this.gameActive) return;
        
        // Simulate punch at random position
        const randomX = (Math.random() - 0.5) * 2;
        const randomY = (Math.random() - 0.5) * 2;
        this.detectPunchCollision(
            (randomX + 1) * window.innerWidth / 2,
            (randomY + 1) * window.innerHeight / 2,
            50
        );
    }

    showError(message) {
        const errorElement = document.getElementById('errorMessage');
        const errorText = document.getElementById('errorText');
        
        if (errorElement && errorText) {
            errorText.textContent = message;
            errorElement.style.display = 'block';
            document.getElementById('startScreen').style.display = 'none';
        }
        console.error('❌ ' + message);
    }

    showMessage(message) {
        console.log('💡 ' + message);
        // You could implement a toast notification here
    }
}

// Enhanced initialization with error handling
let game;

window.addEventListener('load', async () => {
    console.log('🚀 AR Boxing Game Loading...');
    
    try {
        game = new BoxingGame();
        await game.init();
        console.log('🎉 Game ready! Click START to play.');
    } catch (error) {
        console.error('💥 Game failed to load:', error);
        alert('Game failed to load. Please check console for details.');
    }
});

// Global function for testing
window.simulatePunch = () => {
    if (game) game.simulatePunch();
};
