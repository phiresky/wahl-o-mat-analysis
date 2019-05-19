import useFetch from "fetch-suspense";
import _ from "lodash";
import { observable } from "mobx";
import { Observer, observer, useLocalStore } from "mobx-react-lite";
import React, { Suspense } from "react";
import { render } from "react-dom";
import { election as schemas, ElectionList } from "./schemas";
import { createWorker } from "./worker/simple-worker";
import { toMain, toWorker } from "./worker/tsneWorker";

const elFiles = Object.keys(schemas) as (keyof typeof schemas)[];

const tsneConfig = {
	dim: 2,
	perplexity: 30.0,
	earlyExaggeration: 4.0,
	learningRate: 10.0,
	nIter: 1000,
	metric: "euclidean",
};

// https://github.com/gockelhahn/qual-o-mat-data/
const dataPath =
	"https://cdn.jsdelivr.net/gh/gockelhahn/qual-o-mat-data@master/";

//const tsneWorker = new Worker("worker/worker.ts")

const GUI = observer<{}>(() => {
	const data = useFetch(dataPath + "election.json") as ElectionList;
	const chosenElection = 46;
	const electionMeta = data.find(e => e.id === chosenElection);
	if (!electionMeta) throw Error("could not find election");
	// const electionData = useFetch(dataPath + election.path + "/opinion.json")
	const election = _.mapValues(schemas, (_, k) =>
		useFetch(dataPath + electionMeta.path + `/${k}.json`),
	) as typeof schemas;
	/*_.forEach(election, (v, k) => {
		if (Array.isArray(v)) {
			for (const [i, e] of v.entries()) {
				if (i !== e.id) throw Error("id mismatch");
			}
		}
	});
	console.log(election);*/

	const store = useLocalStore(() => {
		const opinions = election.party.map(party =>
			election.statement.map(statement => {
				const opinion = election.opinion.find(
					opinion =>
						opinion.party === party.id &&
						opinion.statement === statement.id,
				);
				if (!opinion) throw Error("no opinion");
				const answer = election.answer.find(
					p => p.id === opinion.answer,
				)!;
				const num = ({
					"Stimme zu": 1,
					"Stimme nicht zu": -1,
					Neutral: 0,
				} as Record<string, number>)[answer.message];
				if (num === undefined) throw Error("unknown answer");
				return num;
			}),
		);

		const obj = observable({
			coords: null as null | [number, number][],
			info: [0, 0, 0],
			status: "wait",
			async run() {
				await worker.INPUT_DATA(opinions);
				this.coords = await worker.RUN(tsneConfig);
			},
		});
		const worker = createWorker<toMain, toWorker>(
			new Worker("./worker/tsneWorker.ts"),
			{
				async STATUS() {},
				async progressData(data) {
					obj.coords = data;
				},
				async progressIter(info) {
					obj.info = info;
				},
				async progressStatus(status) {
					obj.status = status;
				},
			},
		);
		console.log({ worker });
		return obj;
	});

	const coords = store.coords;
	const w = 800;
	const h = 800;
	return (
		<div>
			<h3>
				tSNE <button onClick={() => store.run()}>Run</button>
			</h3>
			<Observer>
				{() => (
					<div>
						Status: {store.status}, iter: {store.info[0]}, error:{" "}
						{store.info[1]}, gradient vector norm: {store.info[2]}
					</div>
				)}
			</Observer>
			<div
				style={{
					width: 800,
					height: 800,
					border: "1px solid black",
					position: "relative",
				}}
			>
				{election.party.map(party => {
					const [x, y] = coords ? coords[party.id] : [0, 0];
					return (
						<div
							key={party.id}
							style={{
								left: (x * w) / 2 + w / 2,
								top: (y * h) / 2 + h / 2,
								position: "absolute",
							}}
						>
							{party.name}
						</div>
					);
				})}
			</div>
		</div>
	);
});

render(
	<Suspense fallback="Loading...">
		<GUI />
	</Suspense>,
	document.getElementById("root"),
);
