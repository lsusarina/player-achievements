import {
  UniversalCamera,
  Color4,
  Vector3,
  HemisphericLight,
  SceneLoader,
  CreateSphere,
  StandardMaterial,
  Mesh,
  CreateBox,
  ArcRotateCamera,
  Scene,
  CannonJSPlugin,
  Axis,
  Ray,
  Color3,
  Sound,
} from "@babylonjs/core";
import "@babylonjs/inspector";
import "@babylonjs/loaders";
import PlayerController from "./controllers/PlayerController";
import { PhysicsImpostor } from "@babylonjs/core/Physics/v1/physicsImpostor";
import { createTexture, setUpUI } from "./utils";
import AchievementController from "./controllers/AchievementsController";

export async function initScene(scene: Scene) {
  scene.getEngine().displayLoadingUI();

  scene.enablePhysics(new Vector3(0, -20, 0), new CannonJSPlugin());

  const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
  light.intensity = 0.7;
  const camera = new UniversalCamera("camera", new Vector3(0, 0, 0), scene);

  scene.activeCamera = camera;
  scene.activeCamera.minZ = 0.05;
  scene.activeCamera.attachControl();

  const debugCamera = new ArcRotateCamera(
    "debug-camera",
    Math.PI,
    Math.PI / 4,
    20,
    Vector3.Zero()
  );

  const ui = setUpUI();
  const achievement = new AchievementController(scene);

  await createEnviroment(scene, achievement);

  const splatters = createTexture();
  const playerMesh = CreateBox("player-mesh");
  const player = new PlayerController(camera, playerMesh, splatters, scene, achievement);
  await player.loadWeapon(
    "./models/",
    "paintball_gun.glb",
    new Vector3(0.3, -0.45, 0.5)
  );

  scene.clearColor = new Color4(0.75, 0.75, 0.9, 1.0);

  const sphere1 = CreateSphere("sphere1", { diameter: 0.5 });
  sphere1.position = new Vector3(0, 1, 4.75);

  const sphere2 = CreateSphere("sphere2", { diameter: 0.5 });
  sphere2.position = new Vector3(0, 3, 14.55);

  sphere1.isPickable = false;

  const ray = new Ray(
    sphere1.getAbsolutePosition(),
    sphere2.position.subtract(sphere1.position).normalize(),
    10
  );

  const redMaterial = new StandardMaterial("red-material");
  redMaterial.diffuseColor = new Color3(1, 0, 0);

  let trapIsReady = true;

  const bombSounds = {
    planting: new Sound(
      "planting-sound",
      "./sounds/bomb_notification.mp3",
      scene,
      null,
      {
        volume: 0.2,
      }
    ),
    beep: new Sound("beep-sound", "./sounds/bomb_beep.mp3", scene, null, {
      loop: true,
      spatialSound: true,
      distanceModel: "exponential",
    }),
  };

  const triggerForBomb = CreateBox("trigger-bomb", {
    width: 6.5,
    height: 0.25,
    depth: 3,
  });

  triggerForBomb.position = new Vector3(-1.5, 4.25, 16.5);
  triggerForBomb.visibility = 0.25;

  let bombWasPlanted = false;

  scene.onBeforeRenderObservable.add(() => {
    const pickingInfo = scene.pickWithRay(ray);

    if (pickingInfo && pickingInfo.pickedMesh.id !== "sphere2" && trapIsReady) {
      trapIsReady = false;
      sphere1.material = sphere2.material = redMaterial;

      const timer = setTimeout(() => {
        trapIsReady = true;
        sphere1.material = sphere2.material = null;
        clearTimeout(timer);
      }, 1500);

      if (pickingInfo.pickedMesh.id === "player-wrapper") {
        player.subtractHealth(5);
      }
    }

    if (
      triggerForBomb.intersectsMesh(player.playerWrapper) &&
      !bombWasPlanted &&
      player.isPlantingTheBomb
    ) {
      bombWasPlanted = true;

      player.movementEnabledStatus = false;

      bombSounds.planting.play();

      setTimeout(async () => {
        const bombObject = await SceneLoader.ImportMeshAsync(
          "",
          "./models/",
          "c4_explosive.glb"
        );

        const bomb = bombObject.meshes[0];

        bomb.scaling = new Vector3(0.1, 0.1, 0.1);

        bomb.position = player.playerWrapper.position.subtract(
          new Vector3(0, 0.9, 0)
        );

        player.movementEnabledStatus = true;

        bombSounds.beep.attachToMesh(bomb);

        bombSounds.beep.play();

        achievement.add("bombsPlanted", 1, "Бомб установлено: ");
      }, 3000);
    }
  });

  window.addEventListener("keydown", (event) => {
    //Ctrl+I
    if (event.ctrlKey && event.keyCode === 73) {
      if (scene.debugLayer.isVisible()) {
        scene.debugLayer.hide();
      } else {
        scene.debugLayer.show();
      }
    }

    if (event.ctrlKey && event.code === "KeyC") {
      scene.activeCamera.detachControl();
      if (scene.activeCamera === camera) {
        scene.activeCamera = debugCamera;
      } else {
        scene.activeCamera = camera;
      }
      scene.activeCamera.attachControl();
    }
  });

  scene.getEngine().hideLoadingUI();
}

async function createEnviroment(scene: Scene, achievement: AchievementController) {
  const themeSound = new Sound(
    "theme-sound",
    "./sounds/theme.mp3",
    scene,
    function () {
      themeSound.play();
    },
    {
      volume: 0.1,
    }
  );

  const explosions = [
    new Sound("explosion-1", "./sounds/explode_1.wav", scene, null, {
      volume: 0.5,
    }),
    new Sound("explosion-2", "./sounds/explode_2.wav", scene, null, {
      volume: 0.5,
    }),
  ];

  const { meshes } = await SceneLoader.ImportMeshAsync(
    "",
    "./models/",
    "paintball-level-final.glb",
    scene
  );

  const floor = scene.getMeshByName("Floor");

  meshes.forEach((mesh) => {
    if (
      mesh.name === "Floor" ||
      mesh.name.includes("Walls") ||
      mesh.name.includes("Element")
    ) {
      mesh.setParent(null);
      mesh.physicsImpostor = new PhysicsImpostor(
        mesh,
        PhysicsImpostor.BoxImpostor,
        {
          mass: 0,
        }
      );
    }

    if (mesh.name.includes("Box")) {
      mesh.setParent(null);
      mesh.physicsImpostor = new PhysicsImpostor(
        mesh,
        PhysicsImpostor.BoxImpostor,
        {
          mass: 10,
        }
      );

      mesh.position.y += 0.5;

      mesh.metadata = {
        counter: 0,
      };

      mesh.physicsImpostor.onCollideEvent = async (collider, collidedWith) => {
        if ((collidedWith.object as Mesh).id === "ball") {
          mesh.metadata.counter++;
        }

        if (mesh.metadata.counter >= 3) {
          achievement.add("boxExplasions", 1, "Коробок взорвано: ")

          const localCube = await SceneLoader.ImportMeshAsync(
            "",
            "./models/",
            "fractured-cube.glb",
            scene
          );
          localCube.meshes[0].position.copyFrom(mesh.position);

          explosions[Math.round(Math.random())].play();

          localCube.meshes.forEach((_mesh) => {
            _mesh.setParent(null);
            _mesh.physicsImpostor = new PhysicsImpostor(
              _mesh,
              PhysicsImpostor.BoxImpostor,
              {
                mass: 0.5,
              }
            );
            _mesh.material = mesh.material;

            _mesh.physicsImpostor.registerOnPhysicsCollide(
              floor.physicsImpostor,
              () => {
                setTimeout(() => {
                  _mesh.physicsImpostor.dispose();
                }, 5000);
              }
            );
          });

          mesh.dispose();
        }
      };
    }

    if (mesh.name === "Ramp") {
      const rampBox1 = CreateBox("ramp-box1", {
        width: 6.71,
        height: 4.14,
        depth: 4,
      });
      rampBox1.position = new Vector3(1.35, 2.17, 2.69);
      const rampBox2 = CreateBox("ramp-box2", {
        width: 6.71,
        height: 4.14,
        depth: 8,
      });
      rampBox2.position = new Vector3(1.35, 0.33, -1.55);
      rampBox2.rotate(Axis.X, -Math.PI / 5.5);
      rampBox1.physicsImpostor = new PhysicsImpostor(
        rampBox1,
        PhysicsImpostor.BoxImpostor
      );
      rampBox2.physicsImpostor = new PhysicsImpostor(
        rampBox2,
        PhysicsImpostor.BoxImpostor
      );
      rampBox1.isVisible = rampBox2.isVisible = false;
    }
  });
}
