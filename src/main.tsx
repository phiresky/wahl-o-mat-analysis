import useFetch from "fetch-suspense";
import _ from "lodash";
import { observer, Observer, useLocalStore } from "mobx-react-lite";
import React, { Suspense, useEffect, useState } from "react";
import { render } from "react-dom";
import Select from "react-select";
import { election as schemas, ElectionList } from "./schemas";
import { createWorker, RemoteInterface } from "./simple-typed-worker";
import { TSNEMaster, TSNEWorker } from "./tsneWorker";

const tsneConfig = {
	dim: 2,
	perplexity: 30.0,
	earlyExaggeration: 4.0,
	learningRate: 100.0,
	nIter: 500,
	metric: "euclidean",
};

// https://github.com/gockelhahn/qual-o-mat-data/
const dataPath =
	"https://cdn.jsdelivr.net/gh/gockelhahn/qual-o-mat-data@master/";

type ElectionMeta = ElectionList[0];
type Election = typeof schemas;
type Party = typeof schemas.party[0];

// first time using react hooks, lets see if it's good
const GUI = observer<{}>(() => {
	const electionMetas = (useFetch(dataPath + "election.json") as ElectionList)
		.slice()
		.reverse();

	const store = useLocalStore(() => ({
		chosenElections: [
			electionMetas.find(e => e.path === "data/2019/europa")!,
			// electionMetas.find(e => e.path === "data/2017/deutschland")!,
		],
	}));

	const zelections = store.chosenElections.map(
		electionMeta =>
			_.mapValues(schemas, (_, k) =>
				useFetch(dataPath + electionMeta.path + `/${k}.json`),
			) as Election,
	);
	console.log(zelections);

	// check id integrity (index === id)
	zelections.map(election =>
		_.forEach(election, (v, k) => {
			if (Array.isArray(v)) {
				for (const [i, e] of v.entries()) {
					if (i !== e.id) throw Error("id mismatch");
				}
			}
		}),
	);

	const partyNames = _(zelections.map(el => el.party).flat())
		.groupBy(p => p.name)
		.filter(z => z.length === zelections.length) // only parties that are in all elections
		.map(z => z[0].name) // just get meta info from first instance of party
		.value();
	console.log(partyNames);
	console.log("get opinions");
	const opinions = partyNames.map(partyName =>
		zelections
			.map(election => {
				const party = election.party.find(p => p.name === partyName);
				if (!party)
					throw Error(
						`${partyName} did not participate in ${
							election.overview.title
						}`,
					);
				return election.statement.map(statement => {
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
				});
			})
			.flat(),
	);
	console.log(opinions);
	const parties: Party[] = partyNames.map((name, index) => ({
		id: index,
		name,
		longname: "??",
	}));

	return (
		<div>
			Choose election(s):{" "}
			<Select<ElectionMeta>
				options={electionMetas}
				getOptionLabel={o => o.name + " " + o.date}
				getOptionValue={o => o.path}
				value={store.chosenElections}
				isMulti
				onChange={v => (store.chosenElections = v as any)}
			/>
			<TSNE
				key={store.chosenElections.map(e => e.path).join("|")}
				opinions={opinions}
				parties={parties}
			/>
		</div>
	);
});

function useWorker<M extends RemoteInterface, W extends RemoteInterface>(
	instantiate: () => Worker,
	handler: M,
): W | null {
	const [tworker, set] = useState<W | null>(null);
	useEffect(() => {
		const w = createWorker<M, W>(instantiate(), handler);
		set(w);
		return () => w.worker.terminate();
	}, []);
	return tworker;
}

const TSNE = observer<{
	opinions: number[][];
	parties: Party[];
}>(({ opinions, parties }) => {
	const store = useLocalStore(() => ({
		coords: null as null | [number, number][],
		info: [0, 0, 0] as [number, number, number],
		status: "uninitialized",
	}));

	const _worker = useWorker<TSNEMaster, TSNEWorker>(
		() => new Worker("./tsneWorker.ts"),
		{
			async progressData(data) {
				store.coords = data;
			},
			async progressIter(info) {
				store.info = info;
			},
			async progressStatus(status) {
				store.status = status;
			},
		},
	);
	if (!_worker) return <div>loading worker...</div>;
	const worker = _worker;
	Object.assign(window, { worker });
	//useEffect()
	const w = 800;
	const h = 800;
	async function run() {
		console.log("opinions", opinions.length, parties.length);
		await worker.setData(opinions);
		store.coords = await worker.run(tsneConfig);
	}
	return (
		<div>
			<button onClick={run}>Run</button>
			<Observer>
				{() => (
					<div>
						Status: {store.status}, iter: {store.info[0]}, error:{" "}
						{store.info[1].toLocaleString(undefined, {
							maximumSignificantDigits: 2,
						})}
						, gradient vector norm:{" "}
						{store.info[2].toLocaleString(undefined, {
							maximumSignificantDigits: 2,
						})}
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
				{parties.map(party => {
					const [x, y] = store.coords
						? store.coords[party.id]
						: [0, 0];
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
	<React.StrictMode>
		<div>
			<h3>tSNE Analysis of German parties based on Wahl-O-Mat data</h3>

			<Suspense fallback="Loading...">
				<GUI />
			</Suspense>
			<small>
				<a href="https://github.com/phiresky/wahl-o-mat-analysis">
					Source code on GitHub
				</a>
			</small>
		</div>
	</React.StrictMode>,
	document.getElementById("root"),
);
