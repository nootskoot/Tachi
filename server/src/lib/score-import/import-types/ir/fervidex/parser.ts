import ScoreImportFatalError from "../../../framework/score-importing/score-import-error";
import {
	EXT_BISTROVER,
	EXT_CASTHOUR,
	EXT_HEROIC_VERSE,
	EXT_RESIDENT,
	MODEL_IIDX,
	MODEL_IIDX_LIGHTNING,
	MODEL_INFINITAS_2,
	REV_2DXTRA,
	REV_NORMAL,
	REV_OMNIMIX,
} from "lib/constants/ea3id";
import { p } from "prudence";
import { ParseEA3SoftID } from "utils/ea3id";
import { FormatPrError, optNull } from "utils/prudence";
import type { ParserFunctionReturns } from "../../common/types";
import type { FervidexContext, FerHeaders as FervidexHeaders, FervidexScore } from "./types";
import type { KtLogger } from "lib/logger/logger";
import type { PrudenceSchema, ValidSchemaValue } from "prudence";
import type { Versions, integer } from "tachi-common";

const PR_FERVIDEX: PrudenceSchema = {
	chart: p.isIn("spb", "spn", "dpn", "sph", "dph", "spa", "dpa", "spl", "dpl"),
	entry_id: p.isPositiveInteger,
	chart_sha256: "*string",
	custom: "*boolean",

	pgreat: p.isPositiveInteger,
	great: p.isPositiveInteger,
	good: p.isPositiveInteger,
	bad: p.isPositiveInteger,
	poor: p.isPositiveInteger,

	slow: p.isPositiveInteger,
	fast: p.isPositiveInteger,
	max_combo: p.optional(p.isPositiveInteger),
	combo_break: p.isPositiveInteger,

	ex_score: p.isPositiveInteger,
	clear_type: p.isBoundedInteger(0, 7),

	gauge: [p.isBoundedInteger(0, 255)],

	// no idea what this actually represents. array of ints.
	ghost: p.any,

	dead: p.optional({
		measure: optNull(p.isPositiveInteger),
		note: optNull(p.isPositiveInteger),
	} as unknown as ValidSchemaValue),

	option: p.optional({
		gauge: optNull(p.isIn("ASSISTED_EASY", "EASY", "HARD", "EX_HARD")),
		range: optNull(
			p.isIn("SUDDEN_PLUS", "HIDDEN_PLUS", "SUD_PLUS_HID_PLUS", "LIFT", "LIFT_SUD_PLUS")
		),
		style: optNull(p.isIn("RANDOM", "R_RANDOM", "S_RANDOM", "MIRROR")),
		style_2p: optNull(p.isIn("RANDOM", "R_RANDOM", "S_RANDOM", "MIRROR")),
		assist: optNull(p.isIn("AUTO_SCRATCH", "LEGACY_NOTE", "ASCR_LEGACY", "FULL_ASSIST")),
	}),

	// we dont use it and we dont care.
	pacemaker: p.any,

	"2dx-gsm": p.optional({
		EASY: [p.isBoundedInteger(0, 255)],
		NORMAL: [p.isBoundedInteger(0, 255)],
		HARD: [p.isBoundedInteger(0, 255)],
		EX_HARD: [p.isBoundedInteger(0, 255)],
	}),

	highlight: p.optional("boolean"),
	duplicate: p.optional("boolean"),
};

/**
 * Converts a string of the form LDJ:X:X:X:2020092900 into a game version.
 * I don't really understand the software model format, so this is lazy.
 */
export function SoftwareIDToVersion(
	model: string,
	logger: KtLogger
): Versions["iidx:DP" | "iidx:SP"] {
	try {
		const data = ParseEA3SoftID(model);

		if (data.model === MODEL_INFINITAS_2) {
			return "INFINITAS";
		} else if (data.model === MODEL_IIDX || data.model === MODEL_IIDX_LIGHTNING) {
			// pretty icky yandere-dev tier if statements, but hey
			// that's just how it works...
			if (data.ext === EXT_HEROIC_VERSE) {
				if (data.rev === REV_OMNIMIX) {
					return "HEROIC VERSE Omnimix";
				} else if (data.rev === REV_2DXTRA) {
					return "HEROIC VERSE 2dxtra";
				} else if (data.rev === REV_NORMAL) {
					return "HEROIC VERSE";
				}
			} else if (data.ext === EXT_BISTROVER) {
				if (data.rev === REV_OMNIMIX) {
					return "BISTROVER Omnimix";
				} else if (data.rev === REV_2DXTRA) {
					return "BISTROVER 2dxtra";
				} else if (data.rev === REV_NORMAL) {
					return "BISTROVER";
				}
			} else if (data.ext === EXT_CASTHOUR) {
				if (data.rev === REV_NORMAL) {
					return "CastHour";
				} else if (data.rev === REV_OMNIMIX) {
					return "CastHour Omnimix";
				}
			} else if (EXT_RESIDENT.includes(data.ext)) {
				if (data.rev === REV_NORMAL) {
					return "Resident";
				}
			}
		}

		throw new ScoreImportFatalError(400, `Unsupported Software Model ${model}.`);
	} catch (err) {
		logger.warn(`Unsupported Software Model ${model}.`, { err });
		throw new ScoreImportFatalError(400, `Unsupported Software Model ${model}.`);
	}
}

export function ParseFervidexSingle(
	body: Record<string, unknown>,
	headers: FervidexHeaders,
	userID: integer,
	logger: KtLogger
): ParserFunctionReturns<FervidexScore, FervidexContext> {
	const version = SoftwareIDToVersion(headers.model, logger);

	// more mods may be added in the future, so lets ignore excess keys.
	const err = p(body, PR_FERVIDEX, undefined, { allowExcessKeys: true });

	if (err) {
		throw new ScoreImportFatalError(400, FormatPrError(err, "Invalid Fervidex Request?"));
	}

	// asserted using prudence.
	const score = body as unknown as FervidexScore;

	return {
		// this import method needs to know the user making the request
		// in order to highlight existing scores. Neat!
		context: { version, timeReceived: Date.now(), userID },
		game: "iidx",
		iterable: [score],
		classProvider: null,
	};
}
