const {
  Vec3,
  createDefaultPrepareRig,
  createWallConfigurer,
  goals,
  runPathfinderScenario
} = require('./pathfinder-scenarios')

const start = new Vec3(0, 64, 0)
const goal = new goals.GoalBlock(1000, 264, 500)
const profileName = 'pathfinder-place-1000-right-500-forward-200-up-wall'
const wallZ = 300
const wallBaseY = 64
const wallHeight = 50

const prepareRig = createDefaultPrepareRig({
  start,
  configureWorld: createWallConfigurer({
    z: wallZ,
    baseY: wallBaseY,
    height: wallHeight
  })
})

async function main() {
  await runPathfinderScenario({
    title: 'Profiled elevated placement pathfinder generation with wall',
    profileName,
    start,
    goal,
    prepareRig
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
