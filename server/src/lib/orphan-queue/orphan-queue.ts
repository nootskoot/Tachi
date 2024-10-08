import db from "external/mongo/db";
import CreateLogCtx from "lib/logger/logger";
import { GetNextCounterValue } from "utils/db";
import { DedupeArr } from "utils/misc";
import type { FilterQuery } from "mongodb";
import type {
	ChartDocument,
	GPTString,
	GPTStringToGame,
	integer,
	OrphanChartDocument,
	SongDocument,
} from "tachi-common";

const logger = CreateLogCtx(__filename);

/**
 * Handles an orphan queue request.
 *
 * If the chart has never been seen before, add it to the orphan queue
 * and return null.
 *
 * If the chart has been seen before, and has less than N unique players
 * who have played it, return null.
 *
 * If the chart has been seen before, and has >= N unique players who have
 * played it, unorphan the chart, and return it.
 */
export async function HandleOrphanQueue<GPT extends GPTString>(
	gptString: GPT,
	game: GPTStringToGame[GPT],
	chartDoc: ChartDocument<GPT>,
	songDoc: SongDocument<GPTStringToGame[GPT]>,
	orphanMatchCriteria: FilterQuery<OrphanChartDocument<GPT>>,
	queueSize: integer,
	userID: integer,
	chartName: string
) {
	logger.debug(`Received orphanqueue request for ${chartName}.`);

	const orphanChart = await db["orphan-chart-queue"].findOne(
		{ gptString, ...orphanMatchCriteria },
		{
			projectID: true,
		}
	);

	if (!orphanChart) {
		logger.verbose(`Received unknown chart ${chartName}, orphaning.`);

		await db["orphan-chart-queue"].insert({
			gptString,
			chartDoc,
			songDoc,
			userIDs: [userID],
		});

		return null;
	}

	orphanChart.userIDs.push(userID);

	const uniqueUsersArr = DedupeArr(orphanChart.userIDs);

	const playcount = uniqueUsersArr.length;

	// If N or more people have played this chart while orphaned, unorphan
	// it.

	if (playcount >= queueSize) {
		logger.info(`Song ${chartName} was unorphaned by userIDs ${uniqueUsersArr.join(", ")}.`);
		const songID = await GetNextCounterValue(`${game}-song-id`);

		logger.verbose(`${chartName} has been assigned songID ${songID}.`);

		const { songDoc, chartDoc } = orphanChart;

		songDoc.id = songID;
		chartDoc.songID = songID;

		await db.anySongs[game].insert(songDoc);
		await db.anyCharts[game].insert(chartDoc);

		await db["orphan-chart-queue"].remove({
			_id: orphanChart._id,
		});

		return chartDoc as ChartDocument<GPT>;
	}

	// otherwise, update the state of this orphan.

	logger.verbose(`UserID ${userID} played ${chartName}, which is now at ${playcount} plays.`);
	await db["orphan-chart-queue"].update(
		{
			_id: orphanChart._id,
		},
		{
			$set: {
				userIDs: uniqueUsersArr,
			},
		}
	);

	return null;
}

/**
 * Forcefully deorphan a song/chart if it's in the queue and matches this criteria.
 *
 * Useful for something like BMS-Table-Sync, where we want to load anything in a table
 * regardless of how many people have played the chart.
 */
export async function DeorphanIfInQueue<GPT extends GPTString>(
	gptString: GPT,
	game: GPTStringToGame[GPT],
	orphanMatchCriteria: FilterQuery<OrphanChartDocument<GPT>>
): Promise<ChartDocument<GPT> | null> {
	const orphanChart = await db["orphan-chart-queue"].findOne(
		{ gptString, ...orphanMatchCriteria },
		{
			projectID: true,
		}
	);

	if (!orphanChart) {
		return null;
	}

	const { songDoc, chartDoc } = orphanChart;

	logger.info(`Song ${songDoc.title} was unorphaned forcefully.`);
	const songID = await GetNextCounterValue(`${game}-song-id`);

	logger.verbose(`${songDoc.title} has been assigned songID ${songID}.`);

	songDoc.id = songID;
	chartDoc.songID = songID;

	await db.anySongs[game].insert(songDoc);
	await db.anyCharts[game].insert(chartDoc);
	await db["orphan-chart-queue"].remove({
		_id: orphanChart._id,
	});

	return chartDoc as ChartDocument<GPT>;
}
