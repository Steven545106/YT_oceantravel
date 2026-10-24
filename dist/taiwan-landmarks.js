import { addLandmarkDetail } from './landmark-detail.js';
import * as THREE from 'three';
import { geoToWorld } from './geo.js';
import { isOnLand } from './land.js';
import { lighthouseBeacons, reflectionExclusions, scene } from './core.js';
import { LANDMARK_BUILDERS } from './landmark-models.js';


export { setTaipei101Night } from './landmark-models.js';

// Placed sights and how high they sit above the ground, so they can be lifted again when a heightmap tile streams in.
const placed = [];
export function regroundTaiwanLandmarks(terrainHeight) {
  for (const { object, offset } of placed) object.position.y = terrainHeight(object.position.x, object.position.z) + offset;
}

export function addTaiwanLandmarks(terrainHeight) {
  const addLighthouse = ({ name, builder, latitude, longitude, towerHeight, radius, flashPeriod, flashPattern }) => {
    const world = geoToWorld({ latitude, longitude });
    const isLand = isOnLand(world.x, world.y);
    const groundHeight = isLand ? terrainHeight(world.x, world.y) : .045;
    const lighthouse = new THREE.Group();
    lighthouse.name = name;
    lighthouse.position.set(world.x, groundHeight, world.y);
    if (isLand) placed.push({ object: lighthouse, offset: 0 });

    // The coastline outline is deliberately simplified, so a small rock base
    // keeps the real-world coastal coordinates grounded even at a coarse edge.
    if (!isLand) {
      const rock = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 2.5, 10, 7),
        new THREE.MeshStandardMaterial({ color: 0x42524b, roughness: 1 })
      );
      rock.scale.y = .45;
      rock.position.y = -.045;
      lighthouse.add(rock);
    }

    // the detailed model is built to unit height; scale it so the lantern sits where the old tower's did
    const model = LANDMARK_BUILDERS[builder]();
    model.scale.setScalar((towerHeight + .2) / model.userData.top);
    lighthouse.add(model);
    const lensMaterial = model.userData.lens;

    lighthouseBeacons.push({ lensMaterial, flashPeriod, flashPattern });
    scene.add(lighthouse);
    addLandmarkDetail(lighthouse,model,{heightAt:terrainHeight,foundation:false});
    reflectionExclusions.push(lighthouse);
  };

  // WGS84 positions and light characteristics from the Maritime and Port Bureau.
  addLighthouse({
    name: 'Keelung Lighthouse', builder: 'keelungLighthouse', latitude: 25.155417, longitude: 121.747733,
    towerHeight: .56, radius: .13, flashPeriod: 7,
    flashPattern: (phase) => phase < .45 || (phase > 2 && phase < 3.05)
  });
  addLighthouse({
    name: 'Eluanbi Lighthouse', builder: 'eluanbi', latitude: 21.902250, longitude: 120.852667,
    towerHeight: .82, radius: .16, flashPeriod: 10,
    flashPattern: (phase) => phase < 1
  });

  addTaipei101();

  function addTaipei101() {
    // Drawn procedurally (no model file): a chamfered square tower of eight flared "ruyi" tiers on a wide base,
    // a stepped crown and a spire with a blinking aviation light (reusing the lighthouse beacon loop).
    // Its height is four times Keelung Lighthouse's.
    const TOWER_LATITUDE = 25.0340, TOWER_LONGITUDE = 121.5645;
    const TOWER_HEIGHT = 4 * .56;
    const world = geoToWorld({ latitude: TOWER_LATITUDE, longitude: TOWER_LONGITUDE });
    const groundHeight = terrainHeight(world.x, world.y);
    const tower = new THREE.Group();
    tower.name = 'Taipei 101';
    tower.position.set(world.x, groundHeight + .005, world.y);
    placed.push({ object: tower, offset: .005 });

    const H = TOWER_HEIGHT;
    const model = LANDMARK_BUILDERS.taipei101();
    model.scale.setScalar(H);
    tower.add(model);

    const beaconMaterial = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: .6, roughness: .3 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(.012, 10, 8), beaconMaterial);
    beacon.position.y = H + .006;
    tower.add(beacon);
    lighthouseBeacons.push({ lensMaterial: beaconMaterial, flashPeriod: 1.6, flashPattern: (phase) => phase < .25 });
    scene.add(tower);
    addLandmarkDetail(tower,model,{heightAt:terrainHeight});
    reflectionExclusions.push(tower);
  }
}
