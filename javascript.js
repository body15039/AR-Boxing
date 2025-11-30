// Optimized AR Boxing Game - drop-in replacement
class OptimizedBoxingGame {
    constructor() {
        // gameplay state
        this.score = 0;
        this.timeLeft = 60;
        this.gameActive = false;
        this.gameSpeed = 1.0;
        this.spawnRate = 1.2; // seconds
        this.lastSpawnTime = 0;
        
        // hand tracking
        this.detector = null;
        this.hands = []; // last detected hands
        this.handLastSample = null;
        this.handVel = { x: 0, y: 0 }; // screen-space velocity
        this.lastPunchTime = 0;
        this.punchCooldown = 350;
        this.punchVelocityThreshold = 10; // tune: screen px/frame
        this.punchDistanceThreshold = 90; // px on screen to object
        
        // throttles
        this.handIntervalMs = 80; // 12.5 Hz hand updates
        this.handIntervalId = null;
        
        // three.js
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // pools
        this.objects = []; // active objects
        this.objectPool = [];
        this.particles = [];
        this.particlePool = [];
        
        // pre-allocated reused vectors
        this._v2 = new THREE.Vector2();
        this._v3 = new THREE.Vector3();
        this._proj = new THREE.Vector3();
        
        // performance tuning
        this.maxObjects = 18;
        this.maxParticles = 120;
        
        console.log('🎮 Optimized AR Boxing Game (pooling + fast collision)');
    }

    async init() {
        try {
            await this.setupCamera();
            this.setupThreeJS();
            this.setupEventListeners();
            await this.initializeHandTrackingSafe();
            this.preparePools();
            this.updateUI();
            console.log('✅ Init complete');
        } catch (e) {
            console.error('Init error', e);
            this.showMessage('Init failed — use SPACE or click to play');
        }
    }

    async setupCamera() {
        const video = document.getElementById('videoElement');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 480 },
                    height: { ideal: 360 },
                    frameRate: { ideal: 30 }
                }
            });
            video.srcObject = stream;
            video.playsInline = true;
            return new Promise(resolve => {
                video.onloadedmetadata = () => {
                    video.play();
                    console.log('📷 Camera ready');
                    resolve();
                };
            });
        } catch (err) {
            console.warn('Camera unavailable', err);
            this.showMessage('Camera not available, fallback to clicks/space');
        }
    }

    async initializeHandTrackingSafe() {
        // initialize detection but fail gracefully
        if (typeof handPoseDetection === 'undefined') {
            console.warn('HandPose lib not present — skipping hand tracking');
            return;
        }
        try {
            const model = handPoseDetection.SupportedModels.MediaPipeHands;
            this.detector = await handPoseDetection.createDetector(model, {
                runtime: 'mediapipe',
                modelType: 'lite',
                maxHands: 1,
                solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/'
            });
            // start interval loop (non-blocking)
            this.handIntervalId = setInterval(() => this.handLoopTick(), this.handIntervalMs);
            console.log('✅ Hand detector ready (interval)', this.handIntervalMs, 'ms');
        } catch (err) {
            console.warn('Hand detector init failed', err);
        }
    }

    setupThreeJS() {
        const canvas = document.getElementById('canvas3d');
        this.scene = new THREE.Scene();
        this.scene.background = null;
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 50);
        this.camera.position.z = 5;
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: false,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(1);

        const ambient = new THREE.AmbientLight(0xffffff, 0.9);
        this.scene.add(ambient);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    preparePools() {
        // object geometry & material (reused)
        this._objectGeo = new THREE.SphereGeometry(0.45, 10, 10); // low poly
        this._materials = {
            normal: new THREE.MeshLambertMaterial({ color: 0x00ff88 }),
            bonus: new THREE.MeshLambertMaterial({ color: 0xffaa00 }),
            danger: new THREE.MeshLambertMaterial({ color: 0xff4444 }),
            explosive: new THREE.MeshLambertMaterial({ color: 0xaa00ff })
        };

        for (let i = 0; i < this.maxObjects; i++) {
            const m = new THREE.Mesh(this._objectGeo, this._materials.normal);
            m.visible = false;
            this.objectPool.push(m);
            this.scene.add(m);
        }

        // particle pool (tiny spheres)
        const pGeo = new THREE.SphereGeometry(0.06, 6, 6);
        for (let i = 0; i < this.maxParticles; i++) {
            const pm = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 1 }));
            pm.visible = false;
            this.particlePool.push(pm);
            this.scene.add(pm);
        }
    }

    setupEventListeners() {
        document.getElementById('startButton').addEventListener('click', () => this.startGame());
        document.getElementById('restartButton').addEventListener('click', () => this.restartGame());

        let lastKey = 0;
        document.addEventListener('keydown', e => {
            const now = Date.now();
            if (e.code === 'Space' && this.gameActive && now - lastKey > 200) {
                lastKey = now;
                this.simulatePunch();
            }
        });

        let lastClick = 0;
        document.addEventListener('click', (e) => {
            const now = Date.now();
            if (this.gameActive && now - lastClick > 150) {
                lastClick = now;
                this.simulatePunchAtPosition(e.clientX, e.clientY);
            }
        });
    }

    startGame() {
        this.score = 0;
        this.timeLeft = 60;
        this.gameActive = true;
        this.objects = [];
        this.particles = [];
        document.getElementById('startScreen').style.display = 'none';
        document.getElementById('gameOverScreen').style.display = 'none';
        this.lastSpawnTime = performance.now() / 1000;
        this.updateUI();
        this._rafId = requestAnimationFrame(() => this.gameLoop());
    }

    restartGame() {
        this.endGame();
        this.startGame();
    }

    gameLoop() {
        if (!this.gameActive) return;
        const now = performance.now();
        this.updateGameState();
        this.updatePhysics();
        this.renderScene();
        this._rafId = requestAnimationFrame(() => this.gameLoop());
    }

    updateGameState() {
        // timer
        this.timeLeft -= 1/60;
        if (this.timeLeft <= 0) {
            this.endGame();
            return;
        }
        // spawn
        const currentTime = performance.now() / 1000;
        if (currentTime - this.lastSpawnTime > this.spawnRate && this.objects.length < this.maxObjects) {
            this.spawnObject();
            this.lastSpawnTime = currentTime;
        }
        this.updateUI();
    }

    async handLoopTick() {
        // do not block — quick check and store small result
        if (!this.detector) return;
        try {
            const video = document.getElementById('videoElement');
            if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
                const hands = await this.detector.estimateHands(video, { flipHorizontal: true });
                if (hands && hands.length > 0) {
                    const h = hands[0];
                    // we use index finger tip (prefer keypoint name or index 8)
                    const index = h.keypoints.find(k => k.name === 'index_finger_tip') || h.keypoints[8];
                    if (index) {
                        // keypoint x,y may be in pixels relative to video or normalized - handle both
                        const vw = video.videoWidth || video.width || video.clientWidth;
                        const vh = video.videoHeight || video.height || video.clientHeight;
                        let sx = index.x, sy = index.y;
                        if (index.x <= 1 && index.y <= 1) { // normalized
                            sx = index.x * vw;
                            sy = index.y * vh;
                        }
                        // map to screen pixels (video may have different aspect -> scale)
                        const screenX = (sx / vw) * window.innerWidth;
                        const screenY = (sy / vh) * window.innerHeight;

                        // compute velocity (screen space)
                        if (this.handLastSample) {
                            const dt = (performance.now() - this.handLastSample.t) / 1000;
                            if (dt > 0) {
                                const vx = (screenX - this.handLastSample.x) / dt;
                                const vy = (screenY - this.handLastSample.y) / dt;
                                // low-pass filter + store
                                this.handVel.x = (this.handVel.x * 0.6) + (vx * 0.4);
                                this.handVel.y = (this.handVel.y * 0.6) + (vy * 0.4);
                            }
                        }
                        this.handLastSample = { x: screenX, y: screenY, t: performance.now() };
                        // Quick punch check: velocity magnitude
                        const vmag = Math.hypot(this.handVel.x, this.handVel.y);
                        if (vmag > this.punchVelocityThreshold && (performance.now() - this.lastPunchTime) > this.punchCooldown) {
                            this.lastPunchTime = performance.now();
                            // call detection using current screen pos
                            this.detectPunchCollision(screenX, screenY);
                        }
                    }
                }
            }
        } catch (err) {
            // silent fail to keep loop stable
            // console.debug('handLoopTick failed', err);
        }
    }

    spawnObject() {
        const types = [
            { type: 'normal', color: 0x00ff88, points: 10, radius: 0.45 },
            { type: 'bonus', color: 0xffaa00, points: 50, radius: 0.36 },
            { type: 'danger', color: 0xff4444, points: -20, radius: 0.6 },
            { type: 'explosive', color: 0xaa00ff, points: 30, radius: 0.4 }
        ];
        const t = types[Math.floor(Math.random() * types.length)];
        const mesh = this.objectPool.find(m => !m.visible) || null;
        if (!mesh) return; // pool exhausted
        mesh.visible = true;
        mesh.material = this._materials[t.type] || this._materials.normal;
        mesh.scale.setScalar(t.radius / 0.45); // adjust size
        mesh.position.set(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.2) * 3 + 0.6,
            -6 - Math.random() * 3
        );
        mesh.userData = {
            type: t.type,
            points: t.points,
            velocityZ: this.gameSpeed * 0.06 + Math.random() * 0.03
        };
        this.objects.push(mesh);
    }

    detectPunchCollision(screenX, screenY) {
        // Fast screen-space proximity: project each active object to screen and measure px distance
        for (let i = this.objects.length - 1; i >= 0; i--) {
            const obj = this.objects[i];
            // project object
            this._proj.copy(obj.position);
            this._proj.project(this.camera); // normalized -1..1
            const px = (this._proj.x * 0.5 + 0.5) * window.innerWidth;
            const py = (-this._proj.y * 0.5 + 0.5) * window.innerHeight;
            // distance in pixels
            const dx = px - screenX;
            const dy = py - screenY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // depth check (object z in camera space)
            const cameraSpace = obj.position.clone().applyMatrix4(this.camera.matrixWorldInverse);
            const zDepth = cameraSpace.z;
            if (dist < this.punchDistanceThreshold && zDepth < 3) {
                // Hit: call hitObject
                this.hitObject(obj);
                break; // one hit per punch
            }
        }
    }

    hitObject(object) {
        const points = object.userData.points || 0;
        this.score = Math.max(0, this.score + points);
        // create optimized particles
        this.spawnParticles(object.position, object.userData.type);
        // remove (return to pool)
        object.visible = false;
        this.objects = this.objects.filter(o => o !== object);
        this.updateUI();
    }

    spawnParticles(position, type) {
        const colors = { normal: 0x00ff88, bonus: 0xffaa00, danger: 0xff4444, explosive: 0xaa00ff };
        const color = colors[type] || 0xffffff;
        const count = 10;
        for (let i = 0; i < count; i++) {
            const p = this.particlePool.find(p => !p.visible);
            if (!p) break;
            p.visible = true;
            p.position.copy(position);
            p.userData = {
                life: 0.9 + Math.random() * 0.4,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.16,
                    (Math.random() - 0.5) * 0.16,
                    (Math.random() - 0.5) * 0.16
                )
            };
            p.material.color.setHex(color);
            p.material.opacity = p.userData.life;
            this.particles.push(p);
        }
    }

    updatePhysics() {
        // update objects
        for (let i = this.objects.length - 1; i >= 0; i--) {
            const obj = this.objects[i];
            obj.position.z += obj.userData.velocityZ;
            obj.position.y += Math.sin((performance.now() * 0.001) + i) * 0.002;
            // despawn if too close
            if (obj.position.z > 3) {
                obj.visible = false;
                this.objects.splice(i, 1);
            }
        }
        // update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.position.add(p.userData.velocity);
            p.userData.life -= 0.03;
            p.material.opacity = Math.max(0, p.userData.life);
            if (p.userData.life <= 0) {
                p.visible = false;
                this.particles.splice(i, 1);
            }
        }
    }

    renderScene() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    updateUI() {
        const sv = document.getElementById('scoreValue');
        const tv = document.getElementById('timerValue');
        if (sv) sv.textContent = this.score;
        if (tv) tv.textContent = Math.ceil(this.timeLeft);
    }

    endGame() {
        this.gameActive = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);
        if (this.handIntervalId) clearInterval(this.handIntervalId);
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('gameOverScreen').style.display = 'block';
        // hide all objects/particles
        this.objects.forEach(o => o.visible = false);
        this.particles.forEach(p => p.visible = false);
        this.objects = [];
        this.particles = [];
    }

    simulatePunch() {
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight;
        this.detectPunchCollision(x, y);
    }

    simulatePunchAtPosition(x, y) {
        this.detectPunchCollision(x, y);
    }

    showMessage(msg) {
        console.log('💡', msg);
    }
}

// Init on load
window.addEventListener('load', () => {
    window.game = new OptimizedBoxingGame();
    game.init();
});
