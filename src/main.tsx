import useFetch from "fetch-suspense"
import _ from "lodash"
import { observer, useLocalStore } from "mobx-react-lite"
import React, { Suspense } from "react"
import { render } from "react-dom"
import TSNE from "../tsne-js/src/index.js"
import { election as schemas, ElectionList } from "./schemas"

const elFiles = Object.keys(schemas) as (keyof typeof schemas)[]

let model = new TSNE({
	dim: 2,
	perplexity: 30.0,
	earlyExaggeration: 4.0,
	learningRate: 100.0,
	nIter: 10000,
	metric: "euclidean",
})

const dataPath = "http://localhost:8080/qual-o-mat-data/"

//const tsneWorker = new Worker("worker/worker.ts")

const GUI = observer<{}>(() => {
	const data = useFetch(dataPath + "election.json") as ElectionList
	const chosenElection = 46
	const electionMeta = data.find(e => e.id === chosenElection)
	if (!electionMeta) throw Error("could not find election")
	// const electionData = useFetch(dataPath + election.path + "/opinion.json")
	const election = _.mapValues(schemas, (_, k) =>
		useFetch(dataPath + electionMeta.path + `/${k}.json`),
	) as typeof schemas
	_.forEach(election, (v, k) => {
		if (Array.isArray(v)) {
			for (const [i, e] of v.entries()) {
				if (i !== e.id) throw Error("id mismatch")
			}
		}
	})
	console.log(election)

	const opinions = election.party.map(party =>
		election.statement.map(statement => {
			const opinion = election.opinion.find(
				opinion =>
					opinion.party === party.id &&
					opinion.statement === statement.id,
			)
			if (!opinion) throw Error("no opinion")
			const answer = election.answer.find(p => p.id === opinion.answer)!
			const num = ({
				"Stimme zu": 1,
				"Stimme nicht zu": -1,
				Neutral: 0,
			} as Record<string, number>)[answer.message]
			if (num === undefined) throw Error("unknown answer")
			return num
		}),
	)
	const store = useLocalStore(() => {
		model.init({ data: opinions })
		let run = false
		return {
			coords: model.getOutputScaled() as [number, number][],
			run() {
				if (run) model.rerun()
				else {
					model.run()
					run = true
				}
				this.coords = model.getOutputScaled()
			},
		}
	})

	const coords = store.coords
	const w = 800
	const h = 800
	return (
		<div>
			<h3>
				tSNE <button onClick={() => store.run()}>Run</button>
			</h3>
			<div
				style={{
					width: 800,
					height: 800,
					border: "1px solid black",
					position: "relative",
				}}
			>
				{election.party.map(party => {
					const [x, y] = coords[party.id]
					return (
						<div
							style={{
								left: (x * w) / 2 + w / 2,
								top: (y * h) / 2 + h / 2,
								position: "absolute",
							}}
						>
							{party.name}
						</div>
					)
				})}
			</div>
		</div>
	)
})

render(
	<Suspense fallback="Loading...">
		<GUI />
	</Suspense>,
	document.getElementById("root"),
)
