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

// for audio
let laserSound, scoreSound;

let score = 0;
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

// global constants for the bullets
const bulletGeometry = new THREE.SphereGeometry(0.02);
const bulletMaterial = new THREE.MeshStandardMaterial({color: 'gray'});
const bulletPrototype = new THREE.Mesh(bulletGeometry, bulletMaterial);

// global constants to manage the movement of the bullets
// This vector points forward along the negative Z-axis. It represents the default direction in which bullets will move.
const forwardVector = new THREE.Vector3(0, 0, -1);
//  10 units per second (fast enough to reach targets 5–10 units away within the bullet's lifetime)
const bulletSpeed = 10;
//  Determines how long each bullet will remain active in the scene (1 second)
const bulletTimeToLive = 1;

// object to keep track of bullet count
const bullets = {};


// STARTING POINT, CHAPTER 1
// function setupScene({ scene, camera, renderer, player, controllers }) {
// 	// ADDING THE FLOOR
// 	const floorGeometry = new THREE.PlaneGeometry(6, 6);
// 	const floorMaterial = new THREE.MeshStandardMaterial({color: 'white'});
// 	const floor = new THREE.Mesh(floorGeometry, floorMaterial);

// 	floor.rotateX(-Math.PI / 2);
// 	scene.add(floor);

// 	// ADDING GEOMETRIES, 1ST A CONE
// 	// creates a cone with a base radius of 0.6 units and a height of 1.5 units.
// 	const coneGeometry = new THREE.ConeGeometry(0.6, 1.5); 

// 	// MeshStandardMaterial gives the cone a purple color and realistic lighting.
// 	const coneMaterial = new THREE.MeshStandardMaterial({color: 'purple'});
// 	const cone = new THREE.Mesh(coneGeometry, coneMaterial);
// 	scene.add(cone);

// 	// The cone is positioned at (0.4, 0.75, -1.5)
// 	cone.position.set(0.4, 0.75, -1.5);

// 	// ADDING A CUBE
// 	//  creates a 1x1x1 cube.
// 	const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
// 	const cubeMaterial = new THREE.MeshStandardMaterial({color: 'orange'});
// 	const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
// 	scene.add(cube);
// 	cube.position.set(-0.8, 0.5, -1.5);
// 	// The cube is rotated 45 degrees around the Y-axis using rotateY(Math.PI / 4)
// 	cube.rotateY(Math.PI / 4);

// 	// ADDING A SPHERE
// 	//  creates a sphere with a 0.4-unit radius.
// 	const sphereGeometry = new THREE.SphereGeometry(0.4);
// 	const sphereMaterial = new THREE.MeshStandardMaterial({color: 'red'});
// 	const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
// 	scene.add(sphere);
// 	sphere.position.set(0.6, 0.4, -0.5);
// 	//  The sphere is scaled up by 20% using scale.set(1.2, 1.2, 1.2)
// 	sphere.scale.set(1.2, 1.2, 1.2);
// }

// global variables
const blasterGroup = new THREE.Group();
const targets = []; // array to keep track of targets, we will need to use this later

function setupScene({scene, camera, renderer, player, controllers}) {
  const gltfLoader = new GLTFLoader();

  // Load the space station environment
  gltfLoader.load('assets/spacestation.glb', gltf => {
    scene.add(gltf.scene);
  });

  // Load the blaster model
  gltfLoader.load('assets/blaster.glb', gltf => {
    blasterGroup.add(gltf.scene);
  });

  // Load and clone the target models
  gltfLoader.load('assets/target.glb', gltf => {
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

	// Load and set up positional audio
  const listener = new THREE.AudioListener();
  camera.add(listener);

  const audioLoader = new THREE.AudioLoader();

  // Laser sound
  laserSound = new THREE.PositionalAudio(listener);
  audioLoader.load('assets/laser.ogg', buffer => {
    laserSound.setBuffer(buffer);
    blasterGroup.add(laserSound);
  });

  // Score sound
  scoreSound = new THREE.PositionalAudio(listener);
  audioLoader.load('assets/score.ogg', buffer => {
    scoreSound.setBuffer(buffer);
    scoreText.add(scoreSound);
  });
	
}


// actual onFrame
function onFrame(delta, time, {scene, camera, renderer, player, controllers}) {
  if (controllers.right) {
    const {gamepad, raySpace, mesh} = controllers.right;

    // Attach the blaster to the right controller
    if (!raySpace.children.includes(blasterGroup)) {
      raySpace.add(blasterGroup);
      mesh.visible = false; // Hide the default controller model
    }

    // Firing bullets
    if (gamepad.getButtonClick(XR_BUTTONS.TRIGGER)) {
      // CHAPTER 6: HAPTIC FEEDBACK
      // vibrate the right controller at 60% intensity for 100 milliseconds every time we shoot.
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
      if (laserSound.isPlaying) laserSound.stop();
      laserSound.play();

      // use the embedded bullet as prototype
      const bulletPrototype = blasterGroup.getObjectByName('bullet');
      if (bulletPrototype) {
        const bullet = bulletPrototype.clone();
        scene.add(bullet);
        // copy position and quaternion directly from the bulletPrototype, instead of from raySpace
        bulletPrototype.getWorldPosition(bullet.position);
        bulletPrototype.getWorldQuaternion(bullet.quaternion);
        
		// // ensures that bullets are fired in the direction the controller is pointing, regardless of its rotation.
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
  }
  Object.values(bullets).forEach(bullet => {
	if (bullet.userData.timeToLive < 0) {
		delete bullets[bullet.uuid];
		scene.remove(bullet);
		return;
	}
	const deltaVec = bullet.userData.velocity.clone().multiplyScalar(delta);
	bullet.position.add(deltaVec);
	bullet.userData.timeToLive -= delta;

	targets
      .filter(target => target.visible)
      .forEach(target => {
        const distance = target.position.distanceTo(bullet.position);
        if (distance < 1) {
          delete bullets[bullet.uuid];
          scene.remove(bullet);

          // make target disappear, and then reappear at a different place after 2 seconds
        //   target.visible = false;
        //   setTimeout(() => {
        //     target.visible = true;
        //     target.position.x = Math.random() * 10 - 5;
        //     target.position.z = -Math.random() * 5 - 5;
        //   }, 2000);

		// better animation
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



// The onFrame function is where we handle updates for every frame
// delta: The time since the last frame in seconds. This is useful for making time-based animations or movements.
// time: // The total elapsed time since the app started. This can be used for tracking overall progress or creating time-based effects.
// function onFrame(delta, time, {scene, camera, renderer, player, controllers}) {
//   if (controllers.right) {
//   const {gamepad, raySpace} = controllers.right;
//   if (gamepad.getButtonClick(XR_BUTTONS.TRIGGER)) {
//     const bullet = bulletPrototype.clone();
//     scene.add(bullet);
//     raySpace.getWorldPosition(bullet.position);
//     raySpace.getWorldQuaternion(bullet.quaternion);

// 	// Chapter 3: Setting up bullet velocity and lifespan
// 	// ensures that bullets are fired in the direction the controller is pointing, regardless of its rotation.
//     const directionVector = forwardVector
//       .clone()
//       .applyQuaternion(bullet.quaternion);
//     bullet.userData = {
//       velocity: directionVector.multiplyScalar(bulletSpeed),
//       timeToLive: bulletTimeToLive,
//     };
//     bullets[bullet.uuid] = bullet;
//   }
// }
// 	Object.values(bullets).forEach(bullet => {
// 	if (bullet.userData.timeToLive < 0) {
// 		delete bullets[bullet.uuid];
// 		scene.remove(bullet);
// 		return;
// 	}
// 	const deltaVec = bullet.userData.velocity.clone().multiplyScalar(delta);
// 	bullet.position.add(deltaVec);
// 	bullet.userData.timeToLive -= delta;
// 	});

// }


init(setupScene, onFrame);
