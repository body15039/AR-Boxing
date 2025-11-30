# 👊 Web AR Punching Game

A browser-based augmented reality game where you punch virtual objects using hand tracking! Built with TensorFlow.js and Three.js.

![Game Screenshot](assets/images/screenshot.png)

## 🎮 How to Play

1. **Allow camera access** when prompted
2. **Make punching motions** with your hands in front of the camera
3. **Hit different colored objects** for points:
   - 🟢 Green: +10 points
   - 🟠 Orange: +50 points  
   - 🔴 Red: -20 points (avoid!)
   - 🟣 Purple: +30 points
4. **Build combos** by hitting objects quickly
5. **Survive** as long as possible - game gets faster!

## 🚀 Live Demo

Play now: [https://your-username.github.io/web-ar-punching-game](https://your-username.github.io/web-ar-punching-game)

## 🛠️ Technologies Used

- **TensorFlow.js HandPose** - Real-time hand tracking
- **Three.js** - 3D graphics and rendering
- **WebRTC** - Camera access
- **Howler.js** - Audio effects

## 📁 Project Structure

```
web-ar-punching-game/
├── index.html          # Main HTML file
├── styles.css          # CSS styles
├── game.js            # Game logic
├── assets/            # Game assets
│   ├── sounds/        # Sound effects
│   └── images/        # Screenshots & icons
└── README.md          # This file
```

## 🎯 Features

- ✅ Real-time hand tracking
- ✅ 3D particle effects
- ✅ Combo multiplier system
- ✅ Progressive difficulty
- ✅ Mobile responsive
- ✅ No installation required

## 🔧 Setup for Development

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/web-ar-punching-game.git
   ```

2. Open `index.html` in a local web server (required for camera access):
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx http-server
   ```

3. Open `http://localhost:8000` in your browser

## 🌐 Browser Support

- ✅ Chrome (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Edge

*Note: Requires HTTPS for camera access in production*

## 📝 License

MIT License - feel free to use this project for learning or personal use!

## 🤝 Contributing

Contributions welcome! Feel free to submit issues and pull requests.

---

**Made with ❤️ and JavaScript**