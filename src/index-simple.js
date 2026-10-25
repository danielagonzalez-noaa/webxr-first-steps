/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Text } from 'troika-three-text';
import { XR_BUTTONS } from 'gamepad-wrapper';
import { gsap } from 'gsap';
import { init } from './init.js';

// global constants for the bullets
const bulletGeometry = new THREE.SphereGeometry(0.02);
const bulletMaterial = new THREE.MeshStandardMaterial({color: 'gray'});
const bulletPrototype = new THREE.Mesh(bulletGeometry, bulletMaterial);


// global constants to manage the movement of the bullets
// This vector points forward along the negative Z-axis. It represents the default direction in which bullets will move.
const forwardVector = new THREE.Vector3(0, 0, -1);
//  5 units per second.
const bulletSpeed = 5;
//  Determines how long each bullet will remain active in the scene (1 second)
const bulletTimeToLive = 1;

// object to keep track of bullet count
const bullets = {};


// STARTING POINT, CHAPTER 1
function setupScene({ scene, camera, renderer, player, controllers }) {
	// ADDING THE FLOOR
	const floorGeometry = new THREE.PlaneGeometry(6, 6);
	const floorMaterial = new THREE.MeshStandardMaterial({color: 'white'});
	const floor = new THREE.Mesh(floorGeometry, floorMaterial);

	floor.rotateX(-Math.PI / 2);
	scene.add(floor);

	// ADDING GEOMETRIES, 1ST A CONE
	// creates a cone with a base radius of 0.6 units and a height of 1.5 units.
	const coneGeometry = new THREE.ConeGeometry(0.6, 1.5); 

	// MeshStandardMaterial gives the cone a purple color and realistic lighting.
	const coneMaterial = new THREE.MeshStandardMaterial({color: 'purple'});
	const cone = new THREE.Mesh(coneGeometry, coneMaterial);
	scene.add(cone);

	// The cone is positioned at (0.4, 0.75, -1.5)
	cone.position.set(0.4, 0.75, -1.5);

	// ADDING A CUBE
	//  creates a 1x1x1 cube.
	const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
	const cubeMaterial = new THREE.MeshStandardMaterial({color: 'orange'});
	const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
	scene.add(cube);
	cube.position.set(-0.8, 0.5, -1.5);
	// The cube is rotated 45 degrees around the Y-axis using rotateY(Math.PI / 4)
	cube.rotateY(Math.PI / 4);

	// ADDING A SPHERE
	//  creates a sphere with a 0.4-unit radius.
	const sphereGeometry = new THREE.SphereGeometry(0.4);
	const sphereMaterial = new THREE.MeshStandardMaterial({color: 'red'});
	const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
	scene.add(sphere);
	sphere.position.set(0.6, 0.4, -0.5);
	//  The sphere is scaled up by 20% using scale.set(1.2, 1.2, 1.2)
	sphere.scale.set(1.2, 1.2, 1.2);
}

// The onFrame function is where we handle updates for every frame
// delta: The time since the last frame in seconds. This is useful for making time-based animations or movements.
// time: // The total elapsed time since the app started. This can be used for tracking overall progress or creating time-based effects.
function onFrame(delta, time, {scene, camera, renderer, player, controllers}) {
  if (controllers.right) {
  const {gamepad, raySpace} = controllers.right;
  if (gamepad.getButtonClick(XR_BUTTONS.TRIGGER)) {
    const bullet = bulletPrototype.clone();
    scene.add(bullet);
    raySpace.getWorldPosition(bullet.position);
    raySpace.getWorldQuaternion(bullet.quaternion);

	// Chapter 3: Setting up bullet velocity and lifespan
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
	Object.values(bullets).forEach(bullet => {
	if (bullet.userData.timeToLive < 0) {
		delete bullets[bullet.uuid];
		scene.remove(bullet);
		return;
	}
	const deltaVec = bullet.userData.velocity.clone().multiplyScalar(delta);
	bullet.position.add(deltaVec);
	bullet.userData.timeToLive -= delta;
	});

}


init(setupScene, onFrame);
