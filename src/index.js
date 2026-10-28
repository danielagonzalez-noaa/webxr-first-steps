/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

// Chapter 4: Actual blaster model
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// ADDING TEXT: CHAPTER 5
// this is to display text HD in three.js
import { Text } from 'troika-three-text';
import { XR_BUTTONS } from 'gamepad-wrapper';
import { gsap } from 'gsap';
import { init } from './init.js';

// (Your original version of this file is saved as src/index.before-upgrade.js)

// ---------------------------------------------------------------------------
// GAME SETTINGS
// ---------------------------------------------------------------------------
// How long one round lasts, in seconds. Change this one number to make rounds longer or shorter.
const GAME_DURATION = 15;

// ---------------------------------------------------------------------------
// GAME STATE
// ---------------------------------------------------------------------------
// 'ready'   -> waiting for the player to press START
// 'playing' -> the round is running, the timer is counting down
// 'over'    -> time is up, showing the final score and a PLAY AGAIN button
let gameState = 'ready';
let timeLeft = GAME_DURATION;
let score = 0;
// after a round ends, ignore the trigger for a moment so a player who is still
// firing doesn't accidentally press PLAY AGAIN
let menuCooldown = 0;
// the scene, saved here so startGame/endGame can add and remove things
let gameScene;

// Small helper so every piece of text in the game looks the same
function makeText(fontSize, color) {
	const text = new Text();
	text.fontSize = fontSize;
	text.font = 'assets/SpaceMono-Bold.ttf';
	text.color = color;
	text.anchorX = 'center';
	text.anchorY = 'middle';
	return text;
}

// ---------------------------------------------------------------------------
// SCORE, TIMER AND MESSAGE TEXT
// ---------------------------------------------------------------------------
const scoreText = new Text();
scoreText.fontSize = 0.52;
scoreText.font = 'assets/SpaceMono-Bold.ttf';
scoreText.position.z = -2;
scoreText.color = 0xffa276;
scoreText.anchorX = 'center';
scoreText.anchorY = 'middle';

// This function updates the score text whenever the score changes. It clamps the score between 0 and 9999 and formats it to be a four-digit number, which is then displayed on the monitor.
function updateScoreDisplay() {
	const clampedScore = Math.max(0, Math.min(9999, score));
	const displayScore = clampedScore.toString().padStart(4, '0');
	scoreText.text = displayScore;
	scoreText.sync();
}

// The countdown. It floats high above the start button so it never overlaps the instructions.
const timerText = makeText(0.28, 0x7ee8ff);
let lastTimerLabel = '';

// Shows the whole seconds left. It only redraws the text when the number changes
// (redrawing text is slow, so we avoid doing it on every single frame).
function updateTimerDisplay() {
	const secondsLeft = Math.ceil(timeLeft);
	const label = `TIME ${String(secondsLeft).padStart(2, '0')}`;
	if (label === lastTimerLabel) return;
	lastTimerLabel = label;
	timerText.text = label;
	// turn red for the last 5 seconds
	timerText.color = secondsLeft <= 5 ? 0xff4d4d : 0x7ee8ff;
	timerText.sync();
}

// Instructions before the game, and "time is up" + the final score after it
const messageText = makeText(0.09, 0xffffff);
messageText.textAlign = 'center';

// ---------------------------------------------------------------------------
// START / PLAY AGAIN BUTTON
// ---------------------------------------------------------------------------
// A green 3D box with text on its front. The player points a blaster at it and pulls the trigger.
const startButtonMaterial = new THREE.MeshStandardMaterial({
	color: 0x1fbf5b,
	emissive: 0x1fbf5b,
	emissiveIntensity: 0.25,
});
const startButton = new THREE.Mesh(
	new THREE.BoxGeometry(1, 0.3, 0.06),
	startButtonMaterial,
);
const startButtonText = makeText(0.12, 0xffffff);
startButtonText.position.z = 0.04; // just in front of the box so it is not hidden inside it
startButton.add(startButtonText);

// A ray is an invisible line shot out of the controller. If it crosses the button, the player is pointing at it.
const raycaster = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const rayQuaternion = new THREE.Quaternion();

// global constants to manage the movement of the bullets
// This vector points forward along the negative Z-axis. It represents the default direction in which bullets will move.
const forwardVector = new THREE.Vector3(0, 0, -1);
//  10 units per second (fast enough to reach targets 5–10 units away within the bullet's lifetime)
const bulletSpeed = 10;
//  Determines how long each bullet will remain active in the scene (1 second)
const bulletTimeToLive = 1;

// object to keep track of bullet count
const bullets = {};

function isPointingAtButton(raySpace) {
	raySpace.getWorldPosition(rayOrigin);
	raySpace.getWorldQuaternion(rayQuaternion);
	const direction = forwardVector.clone().applyQuaternion(rayQuaternion);
	raycaster.set(rayOrigin, direction);
	return raycaster.intersectObject(startButton).length > 0;
}

// ---------------------------------------------------------------------------
// BLASTERS (one for each hand)
// ---------------------------------------------------------------------------
// Each hand gets its own copy of the blaster model, and its own laser sound
const HANDS = ['left', 'right'];
const blasters = {
	left: new THREE.Group(),
	right: new THREE.Group(),
};
const laserSounds = { left: null, right: null };
let scoreSound;

const targets = []; // array to keep track of targets, we will need to use this later

// Put every target back at a fresh random spot, full size and visible
function resetTargets() {
	targets.forEach((target) => {
		gsap.killTweensOf(target.scale); // cancel any shrink/grow that was still running
		target.scale.set(1, 1, 1);
		target.visible = true;
		target.position.x = Math.random() * 10 - 5;
		target.position.z = -Math.random() * 5 - 5;
	});
}

// Show the button and a message (used before the first round and after each round)
function showMenu(buttonLabel, message) {
	startButton.visible = true;
	startButtonText.text = buttonLabel;
	startButtonText.sync();
	messageText.visible = true;
	messageText.text = message;
	messageText.sync();
}

function startGame() {
	gameState = 'playing';
	score = 0;
	updateScoreDisplay();
	timeLeft = GAME_DURATION;
	updateTimerDisplay();
	startButton.visible = false;
	messageText.visible = false;
	resetTargets();
}

function endGame() {
	gameState = 'over';
	menuCooldown = 1.5;
	timeLeft = 0;
	updateTimerDisplay();
	// remove any bullets that are still flying
	Object.values(bullets).forEach((bullet) => {
		gameScene.remove(bullet);
		delete bullets[bullet.uuid];
	});
	showMenu('PLAY AGAIN', `TIME IS UP!\nSCORE ${score}`);
}

// ---------------------------------------------------------------------------
// SET UP THE SCENE
// ---------------------------------------------------------------------------
function setupScene({ scene, camera }) {
	gameScene = scene;
	const gltfLoader = new GLTFLoader();

	// Load the space station environment
	gltfLoader.load('assets/spacestation.glb', (gltf) => {
		scene.add(gltf.scene);
	});

	// Load the blaster model once, then give a copy to each hand
	gltfLoader.load('assets/blaster.glb', (gltf) => {
		const leftModel = gltf.scene.clone();
		blasters.right.add(gltf.scene);
		blasters.left.add(leftModel);
	});

	// Load and clone the target models
	gltfLoader.load('assets/target.glb', (gltf) => {
		for (let i = 0; i < 3; i++) {
			const target = gltf.scene.clone();
			// spawn targets at random locations in front of the player
			target.position.set(
				Math.random() * 10 - 5,
				i * 2 + 1,
				-Math.random() * 5 - 5,
			);
			scene.add(target);
			targets.push(target);
		}
	});

	// Add the score text to the scene
	scene.add(scoreText);
	scoreText.position.set(0, 0.67, -1.44);
	scoreText.rotateX(-Math.PI / 3.3);
	updateScoreDisplay();

	// Add the timer, the message and the start button
	scene.add(timerText);
	timerText.position.set(0, 2.9, -3);
	updateTimerDisplay();

	scene.add(messageText);
	messageText.position.set(0, 1.75, -1.2);

	scene.add(startButton);
	startButton.position.set(0, 1.35, -1.2);

	showMenu(
		'START',
		`SHOOT AS MANY TARGETS AS\nYOU CAN IN ${GAME_DURATION} SECONDS`,
	);

	// Load and set up positional audio
	const listener = new THREE.AudioListener();
	camera.add(listener);

	const audioLoader = new THREE.AudioLoader();

	// Laser sound: one for each blaster, so each one "pews" from its own hand
	HANDS.forEach((hand) => {
		laserSounds[hand] = new THREE.PositionalAudio(listener);
	});
	audioLoader.load('assets/laser.ogg', (buffer) => {
		HANDS.forEach((hand) => {
			laserSounds[hand].setBuffer(buffer);
			blasters[hand].add(laserSounds[hand]);
		});
	});

	// Score sound
	scoreSound = new THREE.PositionalAudio(listener);
	audioLoader.load('assets/score.ogg', (buffer) => {
		scoreSound.setBuffer(buffer);
		scoreText.add(scoreSound);
	});
}

// Fire one bullet from the given hand's blaster
function fireBlaster(hand, scene, gamepad) {
	// CHAPTER 6: HAPTIC FEEDBACK
	// vibrate the controller at 60% intensity for 100 milliseconds every time we shoot.
	// wrapped in try/catch because some controllers/browsers (e.g. the desktop emulator) don't support haptics,
	// and we don't want the whole game to crash if vibration isn't available.
	try {
		gamepad.getHapticActuator(0).pulse(0.6, 100);
	} catch {
		// do nothing, vibration just won't happen
	}

	// CHAPTER 6: LASER SOUND
	// if the laser sound is still playing from the last shot, stop it first so it restarts from the beginning.
	// this way rapid shots each get their own "pew" instead of being ignored.
	const laserSound = laserSounds[hand];
	if (laserSound.isPlaying) laserSound.stop();
	laserSound.play();

	// use the embedded bullet as prototype
	const bulletPrototype = blasters[hand].getObjectByName('bullet');
	if (bulletPrototype) {
		const bullet = bulletPrototype.clone();
		scene.add(bullet);
		// copy position and quaternion directly from the bulletPrototype, instead of from raySpace
		bulletPrototype.getWorldPosition(bullet.position);
		bulletPrototype.getWorldQuaternion(bullet.quaternion);

		// ensures that bullets are fired in the direction the controller is pointing, regardless of its rotation.
		const directionVector = forwardVector
			.clone()
			.applyQuaternion(bullet.quaternion);
		bullet.userData = {
			velocity: directionVector.multiplyScalar(bulletSpeed),
			timeToLive: bulletTimeToLive,
		};
		bullets[bullet.uuid] = bullet;
	}
}

// ---------------------------------------------------------------------------
// EVERY FRAME
// ---------------------------------------------------------------------------
// The onFrame function is where we handle updates for every frame
// delta: The time since the last frame in seconds.
function onFrame(delta, _time, { scene, controllers }) {
	// 1. The countdown
	if (gameState === 'playing') {
		timeLeft -= delta;
		if (timeLeft <= 0) {
			endGame();
		} else {
			updateTimerDisplay();
		}
	} else if (menuCooldown > 0) {
		menuCooldown -= delta;
	}

	// 2. The controllers (both hands work the same way)
	let pointingAtButton = false;
	HANDS.forEach((hand) => {
		const controller = controllers[hand];
		if (!controller) return;
		const { gamepad, raySpace, mesh } = controller;

		// Attach this hand's blaster to its controller
		if (!raySpace.children.includes(blasters[hand])) {
			raySpace.add(blasters[hand]);
			mesh.visible = false; // Hide the default controller model
		}

		const triggerClicked = gamepad.getButtonClick(XR_BUTTONS.TRIGGER);

		if (gameState === 'playing') {
			// During a round, the trigger fires bullets
			if (triggerClicked) fireBlaster(hand, scene, gamepad);
		} else if (menuCooldown <= 0 && isPointingAtButton(raySpace)) {
			// In the menus, the trigger presses the button if the player is pointing at it
			pointingAtButton = true;
			if (triggerClicked) startGame();
		}
	});

	// Make the button glow and grow a little while it is being pointed at
	startButtonMaterial.emissiveIntensity = pointingAtButton ? 0.9 : 0.25;
	startButton.scale.setScalar(pointingAtButton ? 1.08 : 1);

	// 3. Move the bullets and check if they hit a target
	Object.values(bullets).forEach((bullet) => {
		if (bullet.userData.timeToLive < 0) {
			delete bullets[bullet.uuid];
			scene.remove(bullet);
			return;
		}
		const deltaVec = bullet.userData.velocity.clone().multiplyScalar(delta);
		bullet.position.add(deltaVec);
		bullet.userData.timeToLive -= delta;

		targets
			.filter((target) => target.visible)
			.forEach((target) => {
				// a bullet that already hit something earlier in this loop is gone, so it can't score twice
				if (!bullets[bullet.uuid]) return;
				const distance = target.position.distanceTo(bullet.position);
				if (distance < 1) {
					delete bullets[bullet.uuid];
					scene.remove(bullet);

					// make target shrink away, and then reappear at a different place after 1 second
					gsap.to(target.scale, {
						duration: 0.3,
						x: 0,
						y: 0,
						z: 0,
						onComplete: () => {
							target.visible = false;
							setTimeout(() => {
								target.visible = true;
								target.position.x = Math.random() * 10 - 5;
								target.position.z = -Math.random() * 5 - 5;

								// Scale back up the target
								gsap.to(target.scale, {
									duration: 0.3,
									x: 1,
									y: 1,
									z: 1,
								});
							}, 1000);
						},
					});

					score += 10; // Update the score when a target is hit
					updateScoreDisplay(); // Update the rendered troika-three-text object

					// CHAPTER 6: SCORE SOUND
					// play the "ding" when a target is hit. Same trick as the laser: stop it first if it's
					// still playing so back-to-back hits each restart the sound.
					// (the sound is attached to scoreText, so it comes from the score monitor's position in 3D space)
					if (scoreSound.isPlaying) scoreSound.stop();
					scoreSound.play();
				}
			});
	});

	// CHAPTER 6: ADVANCE GSAP ANIMATIONS
	// gsap normally runs on its own timer, but in WebXR the headset controls the frame loop.
	// manually ticking gsap here with delta keeps the target shrink/grow animations in sync with each VR frame.
	gsap.ticker.tick(delta);
}

init(setupScene, onFrame);
