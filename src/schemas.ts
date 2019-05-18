import { AnswerList as answer } from "../qual-o-mat-data/schema/answer"
// import { CategoryList as category } from "../qual-o-mat-data/schema/category"
import { CommentList as comment } from "../qual-o-mat-data/schema/comment"
import { OpinionList as opinion } from "../qual-o-mat-data/schema/opinion"
import { ElectionOverview as overview } from "../qual-o-mat-data/schema/overview"
import { PartyList as party } from "../qual-o-mat-data/schema/party"
import { StatementList as statement } from "../qual-o-mat-data/schema/statement"
export { ElectionList } from "../qual-o-mat-data/schema/election"

export const election = {
	answer: null! as answer,
	// category: null! as category,
	comment: null! as comment,
	opinion: null! as opinion,
	overview: null! as overview,
	party: null! as party,
	statement: null! as statement,
}
