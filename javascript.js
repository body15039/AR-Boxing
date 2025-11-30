// Web AR Punching Game
class PunchingGame {
    constructor() {
        this.score = 0;
        this.timeLeft = 60;
        this.gameActive = false;
        this.gameSpeed = 1.0;
        this.spawnRate = 2.0;
        this.lastSpawnTime = 0;
        this.objects = [];
        this.particles = [];
        this.combo = 1;
        this.highestCombo = 1;
        this.lastHitTime = 0;
        this.comboTimeout = 2000; // 2 seconds to maintain combo
        
        // Hand tracking
        this.detector = null;
        this.hands = [];
        this.lastPunchTime = 0;
        this.punchCooldown = 200;
        
        // Three.js
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        this.init();
    }

    async init() {
        await this.setupCamera();
        await this.setupHandTracking();
        this.setupThreeJS();
        this.setupEventListeners();
        this.gameLoop();
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
                    resolve();
                };
            });
        } catch (err) {
            console.error('Error accessing camera:', err);
            this.showCameraError();
        }
    }

    showCameraError() {
        const startScreen = document.getElementById('startScreen');
        startScreen.innerHTML = `
            <h1>📷 Camera Required</h1>
            <p>This game needs camera access to track your hands.</p>
            <p>Please allow camera permissions and refresh the page.</p>
            <button onclick="location.reload()">TRY AGAIN</button>
        `;
    }

    async setupHandTracking() {
        try {
            const model = handPoseDetection.SupportedModels.MediaPipeHands;
            const detectorConfig = {
                runtime: 'tfjs',
                modelType: 'full',
                maxHands: 2
            };
            
            this.detector = await handPoseDetection.createDetector(model, detectorConfig);
            console.log('Hand tracking model loaded successfully');
        } catch (error) {
            console.error('Error loading hand tracking:', error);
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
        
        // Enhanced lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 2);
        this.scene.add(directionalLight);
        
        // Add some visual effects
        const pointLight = new THREE.PointLight(0x00ff88, 0.5, 10);
        pointLight.position.set(0, 0, 3);
        this.scene.add(pointLight);
        
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupEventListeners() {
        document.getElementById('startButton').addEventListener('click', () => this.startGame());
        document.getElementById('restartButton').addEventListener('click', () => this.restartGame());
    }

    onWindowResize() {
        const canvas = this.renderer.domElement;
        this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    }

    startGame() {
        this.score = 0;
        this.timeLeft = 60;
        this.gameActive = true;
        this.gameSpeed = 1.0;
        this.spawnRate = 2.0;
        this.combo = 1;
        this.highestCombo = 1;
        this.objects = [];
        this.particles = [];
        
        document.getElementById('startScreen').style.display = 'none';
        document.getElementById('gameOverScreen').style.display = 'none';
        
        this.updateUI();
    }

    restartGame() {
        this.startGame();
    }

    async gameLoop() {
        if (this.gameActive) {
            await this.detectHands();
            this.updateGameState();
            this.updateCombo();
            this.spawnObjects();
            this.checkCollisions();
            this.updatePhysics();
            this.renderScene();
        }
        
        requestAnimationFrame(() => this.gameLoop());
    }

    async detectHands() {
        if (!this.detector) return;
        
        const video = document.getElementById('videoElement');
        try {
            this.hands = await this.detector.estimateHands(video);
        } catch (error) {
            console.error('Hand detection error:', error);
        }
    }

    updateGameState() {
        if (!this.gameActive) return;
        
        this.timeLeft -= 1/60;
        if (this.timeLeft <= 0) {
            this.endGame();
        }
        
        // Increase difficulty
        this.gameSpeed = 1.0 + (60 - this.timeLeft) * 0.02;
        this.spawnRate = Math.max(0.3, 2.0 - (60 - this.timeLeft) * 0.025);
        
        this.updateUI();
    }

    updateCombo() {
        const currentTime = performance.now();
        if (currentTime - this.lastHitTime > this.comboTimeout) {
            this.combo = 1;
        }
    }

    spawnObjects() {
        const currentTime = performance.now() / 1000;
        if (currentTime - this.lastSpawnTime > this.spawnRate) {
            this.createObject();
            this.lastSpawnTime = currentTime;
        }
    }

    createObject() {
        const objectTypes = [
            { type: 'normal', color: 0x00ff88, points: 10, radius: 0.3 },
            { type: 'bonus', color: 0xffaa00, points: 50, radius: 0.2 },
            { type: 'danger', color: 0xff4444, points: -20, radius: 0.4 },
            { type: 'explosive', color: 0xaa00ff, points: 30, radius: 0.35 }
        ];
        
        const type = objectTypes[Math.floor(Math.random() * objectTypes.length)];
        const geometry = new THREE.SphereGeometry(type.radius, 16, 16);
        const material = new THREE.MeshPhongMaterial({ 
            color: type.color,
            emissive: type.color,
            emissiveIntensity: 0.8,
            shininess: 100
        });
        
        const object = new THREE.Mesh(geometry, material);
        
        object.position.x = (Math.random() - 0.5) * 8;
        object.position.y = (Math.random() - 0.5) * 4 + 1;
        object.position.z = -15;
        
        object.userData = {
            type: type.type,
            points: type.points,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.1,
                (Math.random() - 0.5) * 0.1,
                this.gameSpeed * 0.15
            ),
            rotationSpeed: new THREE.Vector3(
                Math.random() * 0.03,
                Math.random() * 0.03,
                Math.random() * 0.03
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
            
            const punchVelocity = Math.sqrt(
                Math.pow(indexFinger.x - wrist.x, 2) + 
                Math.pow(indexFinger.y - wrist.y, 2)
            );
            
            if (punchVelocity > 30 && currentTime - this.lastPunchTime > this.punchCooldown) {
                this.lastPunchTime = currentTime;
                
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
        const points = userData.points * this.combo;
        
        this.score += points;
        this.score = Math.max(0, this.score);
        
        // Update combo
        if (points > 0) {
            this.combo++;
            this.lastHitTime = performance.now();
            this.highestCombo = Math.max(this.highestCombo, this.combo);
        } else {
            this.combo = 1;
        }
        
        this.createParticleEffect(object.position, userData.type);
        this.scene.remove(object);
        this.objects = this.objects.filter(obj => obj !== object);
        
        this.updateUI();
    }

    createParticleEffect(position, type) {
        const particleCount = type === 'explosive' ? 40 : 20;
        const colors = {
            normal: 0x00ff88,
            bonus: 0xffaa00,
            danger: 0xff4444,
            explosive: 0xaa00ff
        };
        
        for (let i = 0; i < particleCount; i++) {
            const geometry = new THREE.SphereGeometry(0.05, 8, 8);
            const material = new THREE.MeshBasicMaterial({ 
                color: colors[type] || 0xffffff 
            });
            
            const particle = new THREE.Mesh(geometry, material);
            particle.position.copy(position);
            
            particle.userData = {
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.3,
                    (Math.random() - 0.5) * 0.3,
                    (Math.random() - 0.5) * 0.3
                ),
                life: 1.0
            };
            
            this.scene.add(particle);
            this.particles.push(particle);
        }
    }

    updatePhysics() {
        this.objects.forEach(object => {
            const userData = object.userData;
            object.position.add(userData.velocity);
            object.rotation.x += userData.rotationSpeed.x;
            object.rotation.y += userData.rotationSpeed.y;
            object.rotation.z += userData.rotationSpeed.z;
            
            if (object.position.z > 5) {
                this.scene.remove(object);
                this.objects = this.objects.filter(obj => obj !== object);
            }
        });
        
        this.particles.forEach((particle, index) => {
            const userData = particle.userData;
            particle.position.add(userData.velocity);
            userData.velocity.y -= 0.005; // gravity
            userData.life -= 0.02;
            particle.scale.setScalar(userData.life);
            
            if (userData.life <= 0) {
                this.scene.remove(particle);
                this.particles.splice(index, 1);
            }
        });
    }

    renderScene() {
        this.renderer.render(this.scene, this.camera);
    }

    updateUI() {
        document.getElementById('scoreValue').textContent = this.score;
        document.getElementById('timerValue').textContent = Math.max(0, Math.ceil(this.timeLeft));
        document.getElementById('comboValue').textContent = this.combo + 'x';
        
        // Combo visual effect
        const comboDisplay = document.getElementById('comboValue');
        comboDisplay.style.color = this.combo > 1 ? '#ff6b6b' : '#ffffff';
        comboDisplay.style.transform = this.combo > 1 ? 'scale(1.2)' : 'scale(1)';
    }

    endGame() {
        this.gameActive = false;
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('highestCombo').textContent = this.highestCombo + 'x';
        document.getElementById('gameOverScreen').style.display = 'block';
        
        this.objects.forEach(object => this.scene.remove(object));
        this.objects = [];
        this.particles.forEach(particle => this.scene.remove(particle));
        this.particles = [];
    }
}

// Initialize game
window.addEventListener('load', () => {
    new PunchingGame();
});