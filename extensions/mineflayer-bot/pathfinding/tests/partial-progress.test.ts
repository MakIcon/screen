import assert from 'node:assert/strict'
import test from 'node:test'
import { AStarBackOff } from '../src/abstract/algorithms/astar'
import { CPathNode, PathData } from '../src/abstract/node'

function search () {
  const start = { hash: 'start', cost: 0 }
  return new AStarBackOff(start, { sanitize: () => true, getNeighbors: () => [] },
    { isEnd: () => false, heuristic: () => 100 }, 1000)
}

function candidate (hash: string, g: number, h: number, edges: number): CPathNode<PathData> {
  let parent = new CPathNode<PathData>(0, 100, { hash: 'start', cost: 0 })
  for (let i = 1; i < edges; i++) parent = new CPathNode(g * i / edges, 100, { hash: `${hash}:${i}`, cost: 1 }, parent)
  return new CPathNode(g, h, { hash, cost: 1 }, parent)
}

test('partial search prefers affordable progress before the most costly shortcut', () => {
  const astar = search()
  const affordable = candidate('affordable', 10, 60, 6)
  const expensive = candidate('expensive', 120, 10, 6)
  astar.assignBestNodes(affordable)
  astar.assignBestNodes(expensive)
  assert.equal(astar.getActualBestNode(), affordable)
})

test('distance remaining cannot make an unchanged start a useful partial route', () => {
  const astar = search()
  const progress = candidate('costly-first-step', 500, 80, 1)
  astar.assignBestNodes(progress)
  assert.equal(astar.getActualBestNode(), progress)
})
