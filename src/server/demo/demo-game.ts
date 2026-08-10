/**
 * The demo game every new account is seeded with — a real, fully analyzed
 * game, exported from a live analysis run rather than hand-written, so the
 * evaluations, best moves and concept highlights are genuine engine output.
 *
 * Generated once from the dev database; regenerate by re-running the export
 * script if the analysis pipeline's output shape changes. Deliberately a
 * checked-in fixture rather than a DB lookup: a fresh production database
 * has no games to copy from, and seeding must not depend on the engine
 * being available at signup time.
 *
 * Note there are no reflections here, and every key moment is left PENDING —
 * the whole point of the product is that the user's own reasoning comes
 * first, so a pre-reviewed demo would defeat it.
 */
export const DEMO_GAME = {
  "game": {
    "pgn": "[Event \"Live Chess\"]\n[Site \"Chess.com\"]\n[Date \"2026.07.21\"]\n[Round \"-\"]\n[White \"BuKefaL321\"]\n[Black \"seedplayer\"]\n[Result \"1-0\"]\n[CurrentPosition \"2r2r2/pb2ppkp/1p1p1np1/2n2P2/8/2NB1N1P/PPP1QPP1/R3R1K1 b - - 0 16\"]\n[Timezone \"UTC\"]\n[ECO \"B27\"]\n[ECOUrl \"https://www.chess.com/openings/Sicilian-Defense-Hyperaccelerated-Dragon-Fianchetto-Variation-3...cxd4-4.Qxd4-Nf6\"]\n[UTCDate \"2026.07.21\"]\n[UTCTime \"00:31:53\"]\n[WhiteElo \"1861\"]\n[BlackElo \"1853\"]\n[TimeControl \"600\"]\n[Termination \"BuKefaL321 won by resignation\"]\n[StartTime \"00:31:53\"]\n[EndDate \"2026.07.21\"]\n[EndTime \"00:36:11\"]\n[Link \"https://www.chess.com/game/live/171851316730\"]\n\n1. e4 {[%clk 0:09:58]} 1... c5 {[%clk 0:09:58.8]} 2. Nf3 {[%clk 0:09:56.2]} 2... g6 {[%clk 0:09:58.1]} 3. d4 {[%clk 0:09:54.4]} 3... cxd4 {[%clk 0:09:56.4]} 4. Qxd4 {[%clk 0:09:53.3]} 4... Nf6 {[%clk 0:09:55.7]} 5. h3 {[%clk 0:09:46.5]} 5... Bg7 {[%clk 0:09:54.4]} 6. Nc3 {[%clk 0:09:24.8]} 6... O-O {[%clk 0:09:52.5]} 7. Qd1 {[%clk 0:09:13.1]} 7... d6 {[%clk 0:09:25.5]} 8. Be3 {[%clk 0:09:09.2]} 8... b6 {[%clk 0:09:20.4]} 9. Qd2 {[%clk 0:09:04.6]} 9... Bb7 {[%clk 0:08:53.1]} 10. Bd3 {[%clk 0:09:03]} 10... Nbd7 {[%clk 0:08:26.7]} 11. Bh6 {[%clk 0:09:01.3]} 11... Nc5 {[%clk 0:08:25.4]} 12. Bxg7 {[%clk 0:08:59.5]} 12... Kxg7 {[%clk 0:08:24.5]} 13. Qe2 {[%clk 0:08:46.7]} 13... Rc8 {[%clk 0:08:03.3]} 14. O-O {[%clk 0:08:43]} 14... Qd7 {[%clk 0:07:44.1]} 15. Rfe1 {[%clk 0:08:17.7]} 15... Qf5 {[%clk 0:07:39.1]} 16. exf5 {[%clk 0:08:14.8]} 1-0\n",
    "whitePlayer": "BuKefaL321",
    "blackPlayer": "seedplayer",
    "userColor": "black",
    "result": "1-0",
    "playedAt": "2026-07-21T00:36:11.000Z",
    "timeControl": "rapid",
    "opening": "Sicilian Defense Hyperaccelerated Dragon Fianchetto Variation",
    "terminationReason": "resignation",
    "userRating": null
  },
  "moves": [
    {
      "ply": 1,
      "moveNumber": 1,
      "color": "white",
      "san": "e4",
      "uci": "e2e4",
      "fenBefore": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "fenAfter": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      "clockSeconds": 598
    },
    {
      "ply": 2,
      "moveNumber": 1,
      "color": "black",
      "san": "c5",
      "uci": "c7c5",
      "fenBefore": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      "fenAfter": "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      "clockSeconds": 598
    },
    {
      "ply": 3,
      "moveNumber": 2,
      "color": "white",
      "san": "Nf3",
      "uci": "g1f3",
      "fenBefore": "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      "fenAfter": "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
      "clockSeconds": 596
    },
    {
      "ply": 4,
      "moveNumber": 2,
      "color": "black",
      "san": "g6",
      "uci": "g7g6",
      "fenBefore": "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
      "fenAfter": "rnbqkbnr/pp1ppp1p/6p1/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3",
      "clockSeconds": 598
    },
    {
      "ply": 5,
      "moveNumber": 3,
      "color": "white",
      "san": "d4",
      "uci": "d2d4",
      "fenBefore": "rnbqkbnr/pp1ppp1p/6p1/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3",
      "fenAfter": "rnbqkbnr/pp1ppp1p/6p1/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3",
      "clockSeconds": 594
    },
    {
      "ply": 6,
      "moveNumber": 3,
      "color": "black",
      "san": "cxd4",
      "uci": "c5d4",
      "fenBefore": "rnbqkbnr/pp1ppp1p/6p1/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3",
      "fenAfter": "rnbqkbnr/pp1ppp1p/6p1/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4",
      "clockSeconds": 596
    },
    {
      "ply": 7,
      "moveNumber": 4,
      "color": "white",
      "san": "Qxd4",
      "uci": "d1d4",
      "fenBefore": "rnbqkbnr/pp1ppp1p/6p1/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4",
      "fenAfter": "rnbqkbnr/pp1ppp1p/6p1/8/3QP3/5N2/PPP2PPP/RNB1KB1R b KQkq - 0 4",
      "clockSeconds": 593
    },
    {
      "ply": 8,
      "moveNumber": 4,
      "color": "black",
      "san": "Nf6",
      "uci": "g8f6",
      "fenBefore": "rnbqkbnr/pp1ppp1p/6p1/8/3QP3/5N2/PPP2PPP/RNB1KB1R b KQkq - 0 4",
      "fenAfter": "rnbqkb1r/pp1ppp1p/5np1/8/3QP3/5N2/PPP2PPP/RNB1KB1R w KQkq - 1 5",
      "clockSeconds": 595
    },
    {
      "ply": 9,
      "moveNumber": 5,
      "color": "white",
      "san": "h3",
      "uci": "h2h3",
      "fenBefore": "rnbqkb1r/pp1ppp1p/5np1/8/3QP3/5N2/PPP2PPP/RNB1KB1R w KQkq - 1 5",
      "fenAfter": "rnbqkb1r/pp1ppp1p/5np1/8/3QP3/5N1P/PPP2PP1/RNB1KB1R b KQkq - 0 5",
      "clockSeconds": 586
    },
    {
      "ply": 10,
      "moveNumber": 5,
      "color": "black",
      "san": "Bg7",
      "uci": "f8g7",
      "fenBefore": "rnbqkb1r/pp1ppp1p/5np1/8/3QP3/5N1P/PPP2PP1/RNB1KB1R b KQkq - 0 5",
      "fenAfter": "rnbqk2r/pp1pppbp/5np1/8/3QP3/5N1P/PPP2PP1/RNB1KB1R w KQkq - 1 6",
      "clockSeconds": 594
    },
    {
      "ply": 11,
      "moveNumber": 6,
      "color": "white",
      "san": "Nc3",
      "uci": "b1c3",
      "fenBefore": "rnbqk2r/pp1pppbp/5np1/8/3QP3/5N1P/PPP2PP1/RNB1KB1R w KQkq - 1 6",
      "fenAfter": "rnbqk2r/pp1pppbp/5np1/8/3QP3/2N2N1P/PPP2PP1/R1B1KB1R b KQkq - 2 6",
      "clockSeconds": 564
    },
    {
      "ply": 12,
      "moveNumber": 6,
      "color": "black",
      "san": "O-O",
      "uci": "e8g8",
      "fenBefore": "rnbqk2r/pp1pppbp/5np1/8/3QP3/2N2N1P/PPP2PP1/R1B1KB1R b KQkq - 2 6",
      "fenAfter": "rnbq1rk1/pp1pppbp/5np1/8/3QP3/2N2N1P/PPP2PP1/R1B1KB1R w KQ - 3 7",
      "clockSeconds": 592
    },
    {
      "ply": 13,
      "moveNumber": 7,
      "color": "white",
      "san": "Qd1",
      "uci": "d4d1",
      "fenBefore": "rnbq1rk1/pp1pppbp/5np1/8/3QP3/2N2N1P/PPP2PP1/R1B1KB1R w KQ - 3 7",
      "fenAfter": "rnbq1rk1/pp1pppbp/5np1/8/4P3/2N2N1P/PPP2PP1/R1BQKB1R b KQ - 4 7",
      "clockSeconds": 553
    },
    {
      "ply": 14,
      "moveNumber": 7,
      "color": "black",
      "san": "d6",
      "uci": "d7d6",
      "fenBefore": "rnbq1rk1/pp1pppbp/5np1/8/4P3/2N2N1P/PPP2PP1/R1BQKB1R b KQ - 4 7",
      "fenAfter": "rnbq1rk1/pp2ppbp/3p1np1/8/4P3/2N2N1P/PPP2PP1/R1BQKB1R w KQ - 0 8",
      "clockSeconds": 565
    },
    {
      "ply": 15,
      "moveNumber": 8,
      "color": "white",
      "san": "Be3",
      "uci": "c1e3",
      "fenBefore": "rnbq1rk1/pp2ppbp/3p1np1/8/4P3/2N2N1P/PPP2PP1/R1BQKB1R w KQ - 0 8",
      "fenAfter": "rnbq1rk1/pp2ppbp/3p1np1/8/4P3/2N1BN1P/PPP2PP1/R2QKB1R b KQ - 1 8",
      "clockSeconds": 549
    },
    {
      "ply": 16,
      "moveNumber": 8,
      "color": "black",
      "san": "b6",
      "uci": "b7b6",
      "fenBefore": "rnbq1rk1/pp2ppbp/3p1np1/8/4P3/2N1BN1P/PPP2PP1/R2QKB1R b KQ - 1 8",
      "fenAfter": "rnbq1rk1/p3ppbp/1p1p1np1/8/4P3/2N1BN1P/PPP2PP1/R2QKB1R w KQ - 0 9",
      "clockSeconds": 560
    },
    {
      "ply": 17,
      "moveNumber": 9,
      "color": "white",
      "san": "Qd2",
      "uci": "d1d2",
      "fenBefore": "rnbq1rk1/p3ppbp/1p1p1np1/8/4P3/2N1BN1P/PPP2PP1/R2QKB1R w KQ - 0 9",
      "fenAfter": "rnbq1rk1/p3ppbp/1p1p1np1/8/4P3/2N1BN1P/PPPQ1PP1/R3KB1R b KQ - 1 9",
      "clockSeconds": 544
    },
    {
      "ply": 18,
      "moveNumber": 9,
      "color": "black",
      "san": "Bb7",
      "uci": "c8b7",
      "fenBefore": "rnbq1rk1/p3ppbp/1p1p1np1/8/4P3/2N1BN1P/PPPQ1PP1/R3KB1R b KQ - 1 9",
      "fenAfter": "rn1q1rk1/pb2ppbp/1p1p1np1/8/4P3/2N1BN1P/PPPQ1PP1/R3KB1R w KQ - 2 10",
      "clockSeconds": 533
    },
    {
      "ply": 19,
      "moveNumber": 10,
      "color": "white",
      "san": "Bd3",
      "uci": "f1d3",
      "fenBefore": "rn1q1rk1/pb2ppbp/1p1p1np1/8/4P3/2N1BN1P/PPPQ1PP1/R3KB1R w KQ - 2 10",
      "fenAfter": "rn1q1rk1/pb2ppbp/1p1p1np1/8/4P3/2NBBN1P/PPPQ1PP1/R3K2R b KQ - 3 10",
      "clockSeconds": 543
    },
    {
      "ply": 20,
      "moveNumber": 10,
      "color": "black",
      "san": "Nbd7",
      "uci": "b8d7",
      "fenBefore": "rn1q1rk1/pb2ppbp/1p1p1np1/8/4P3/2NBBN1P/PPPQ1PP1/R3K2R b KQ - 3 10",
      "fenAfter": "r2q1rk1/pb1nppbp/1p1p1np1/8/4P3/2NBBN1P/PPPQ1PP1/R3K2R w KQ - 4 11",
      "clockSeconds": 506
    },
    {
      "ply": 21,
      "moveNumber": 11,
      "color": "white",
      "san": "Bh6",
      "uci": "e3h6",
      "fenBefore": "r2q1rk1/pb1nppbp/1p1p1np1/8/4P3/2NBBN1P/PPPQ1PP1/R3K2R w KQ - 4 11",
      "fenAfter": "r2q1rk1/pb1nppbp/1p1p1npB/8/4P3/2NB1N1P/PPPQ1PP1/R3K2R b KQ - 5 11",
      "clockSeconds": 541
    },
    {
      "ply": 22,
      "moveNumber": 11,
      "color": "black",
      "san": "Nc5",
      "uci": "d7c5",
      "fenBefore": "r2q1rk1/pb1nppbp/1p1p1npB/8/4P3/2NB1N1P/PPPQ1PP1/R3K2R b KQ - 5 11",
      "fenAfter": "r2q1rk1/pb2ppbp/1p1p1npB/2n5/4P3/2NB1N1P/PPPQ1PP1/R3K2R w KQ - 6 12",
      "clockSeconds": 505
    },
    {
      "ply": 23,
      "moveNumber": 12,
      "color": "white",
      "san": "Bxg7",
      "uci": "h6g7",
      "fenBefore": "r2q1rk1/pb2ppbp/1p1p1npB/2n5/4P3/2NB1N1P/PPPQ1PP1/R3K2R w KQ - 6 12",
      "fenAfter": "r2q1rk1/pb2ppBp/1p1p1np1/2n5/4P3/2NB1N1P/PPPQ1PP1/R3K2R b KQ - 0 12",
      "clockSeconds": 539
    },
    {
      "ply": 24,
      "moveNumber": 12,
      "color": "black",
      "san": "Kxg7",
      "uci": "g8g7",
      "fenBefore": "r2q1rk1/pb2ppBp/1p1p1np1/2n5/4P3/2NB1N1P/PPPQ1PP1/R3K2R b KQ - 0 12",
      "fenAfter": "r2q1r2/pb2ppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPPQ1PP1/R3K2R w KQ - 0 13",
      "clockSeconds": 504
    },
    {
      "ply": 25,
      "moveNumber": 13,
      "color": "white",
      "san": "Qe2",
      "uci": "d2e2",
      "fenBefore": "r2q1r2/pb2ppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPPQ1PP1/R3K2R w KQ - 0 13",
      "fenAfter": "r2q1r2/pb2ppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPP1QPP1/R3K2R b KQ - 1 13",
      "clockSeconds": 526
    },
    {
      "ply": 26,
      "moveNumber": 13,
      "color": "black",
      "san": "Rc8",
      "uci": "a8c8",
      "fenBefore": "r2q1r2/pb2ppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPP1QPP1/R3K2R b KQ - 1 13",
      "fenAfter": "2rq1r2/pb2ppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPP1QPP1/R3K2R w KQ - 2 14",
      "clockSeconds": 483
    },
    {
      "ply": 27,
      "moveNumber": 14,
      "color": "white",
      "san": "O-O",
      "uci": "e1g1",
      "fenBefore": "2rq1r2/pb2ppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPP1QPP1/R3K2R w KQ - 2 14",
      "fenAfter": "2rq1r2/pb2ppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPP1QPP1/R4RK1 b - - 3 14",
      "clockSeconds": 523
    },
    {
      "ply": 28,
      "moveNumber": 14,
      "color": "black",
      "san": "Qd7",
      "uci": "d8d7",
      "fenBefore": "2rq1r2/pb2ppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPP1QPP1/R4RK1 b - - 3 14",
      "fenAfter": "2r2r2/pb1qppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPP1QPP1/R4RK1 w - - 4 15",
      "clockSeconds": 464
    },
    {
      "ply": 29,
      "moveNumber": 15,
      "color": "white",
      "san": "Rfe1",
      "uci": "f1e1",
      "fenBefore": "2r2r2/pb1qppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPP1QPP1/R4RK1 w - - 4 15",
      "fenAfter": "2r2r2/pb1qppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPP1QPP1/R3R1K1 b - - 5 15",
      "clockSeconds": 497
    },
    {
      "ply": 30,
      "moveNumber": 15,
      "color": "black",
      "san": "Qf5",
      "uci": "d7f5",
      "fenBefore": "2r2r2/pb1qppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPP1QPP1/R3R1K1 b - - 5 15",
      "fenAfter": "2r2r2/pb2ppkp/1p1p1np1/2n2q2/4P3/2NB1N1P/PPP1QPP1/R3R1K1 w - - 6 16",
      "clockSeconds": 459
    },
    {
      "ply": 31,
      "moveNumber": 16,
      "color": "white",
      "san": "exf5",
      "uci": "e4f5",
      "fenBefore": "2r2r2/pb2ppkp/1p1p1np1/2n2q2/4P3/2NB1N1P/PPP1QPP1/R3R1K1 w - - 6 16",
      "fenAfter": "2r2r2/pb2ppkp/1p1p1np1/2n2P2/8/2NB1N1P/PPP1QPP1/R3R1K1 b - - 0 16",
      "clockSeconds": 494
    }
  ],
  "keyMoments": [
    {
      "sortIndex": 0,
      "ply": 10,
      "fen": "rnbqkb1r/pp1ppp1p/5np1/8/3QP3/5N1P/PPP2PP1/RNB1KB1R b KQkq - 0 5",
      "originalSan": "Bg7",
      "originalUci": "f8g7",
      "bestMoveSan": "Nc6",
      "bestMoveUci": "b8c6",
      "evalBeforeCp": -9,
      "evalBeforeMate": null,
      "evalAfterCp": 26,
      "evalAfterMate": null,
      "selectionReason": "Your practical winning chances dropped by about 3 percentage points.",
      "classification": "GOOD",
      "principalVariation": "[\"Nc6\",\"Qa4\",\"d5\",\"e5\",\"Ne4\",\"Bb5\",\"Bd7\",\"O-O\"]",
      "conceptHighlights": "[{\"concept\":\"skewer\",\"note\":\"the White queen on d4 attacks the Black knight on f6, which must move and expose the Black bishop on g7 behind it\",\"squares\":[\"d4\",\"f6\",\"g7\"]}]",
      "importanceScore": 16,
      "importanceTier": "MINOR"
    },
    {
      "sortIndex": 1,
      "ply": 12,
      "fen": "rnbqk2r/pp1pppbp/5np1/8/3QP3/2N2N1P/PPP2PP1/R1B1KB1R b KQkq - 2 6",
      "originalSan": "O-O",
      "originalUci": "e8g8",
      "bestMoveSan": "Nc6",
      "bestMoveUci": "b8c6",
      "evalBeforeCp": 14,
      "evalBeforeMate": null,
      "evalAfterCp": 53,
      "evalAfterMate": null,
      "selectionReason": "Your practical winning chances dropped by about 3 percentage points.",
      "classification": "GOOD",
      "principalVariation": "[\"Nc6\",\"Qd1\",\"O-O\",\"Be2\",\"b6\",\"O-O\",\"Bb7\",\"Bg5\"]",
      "conceptHighlights": "[{\"concept\":\"skewer\",\"note\":\"the White queen on d4 attacks the Black knight on f6, which must move and expose the Black bishop on g7 behind it\",\"squares\":[\"d4\",\"f6\",\"g7\"]},{\"concept\":\"back-rank weakness\",\"note\":\"the king on g8 has no escape square on the back rank\",\"squares\":[\"g8\"]}]",
      "importanceScore": 16,
      "importanceTier": "MINOR"
    },
    {
      "sortIndex": 2,
      "ply": 22,
      "fen": "r2q1rk1/pb1nppbp/1p1p1npB/8/4P3/2NB1N1P/PPPQ1PP1/R3K2R b KQ - 5 11",
      "originalSan": "Nc5",
      "originalUci": "d7c5",
      "bestMoveSan": "b5",
      "bestMoveUci": "b6b5",
      "evalBeforeCp": -27,
      "evalBeforeMate": null,
      "evalAfterCp": -10,
      "evalAfterMate": null,
      "selectionReason": "Your practical winning chances dropped by about 2 percentage points.",
      "classification": "BEST",
      "principalVariation": "[\"b5\",\"Bxg7\",\"Kxg7\",\"Bxb5\",\"Nc5\",\"Bd3\",\"Qb6\",\"O-O\"]",
      "conceptHighlights": "[{\"concept\":\"back-rank weakness\",\"note\":\"the king on g8 has no escape square on the back rank\",\"squares\":[\"g8\"]}]",
      "importanceScore": 16,
      "importanceTier": "MINOR"
    },
    {
      "sortIndex": 3,
      "ply": 28,
      "fen": "2rq1r2/pb2ppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPP1QPP1/R4RK1 b - - 3 14",
      "originalSan": "Qd7",
      "originalUci": "d8d7",
      "bestMoveSan": "a6",
      "bestMoveUci": "a7a6",
      "evalBeforeCp": -39,
      "evalBeforeMate": null,
      "evalAfterCp": -12,
      "evalAfterMate": null,
      "selectionReason": "Your practical winning chances dropped by about 2 percentage points.",
      "classification": "GOOD",
      "principalVariation": "[\"a6\",\"a4\",\"Re8\",\"Rfd1\",\"e5\",\"Nh4\",\"Re7\",\"Nf3\"]",
      "conceptHighlights": "[]",
      "importanceScore": 16,
      "importanceTier": "MINOR"
    },
    {
      "sortIndex": 4,
      "ply": 30,
      "fen": "2r2r2/pb1qppkp/1p1p1np1/2n5/4P3/2NB1N1P/PPP1QPP1/R3R1K1 b - - 5 15",
      "originalSan": "Qf5",
      "originalUci": "d7f5",
      "bestMoveSan": "e5",
      "bestMoveUci": "e7e5",
      "evalBeforeCp": -26,
      "evalBeforeMate": null,
      "evalAfterCp": 587,
      "evalAfterMate": null,
      "selectionReason": "The evaluation swung heavily against you — your practical winning chances dropped by about 42 percentage points.",
      "classification": "BLUNDER",
      "principalVariation": "[\"e5\",\"Rad1\",\"Qe7\",\"Qe3\",\"Rfd8\",\"a3\",\"Ne6\",\"Bf1\"]",
      "conceptHighlights": "[]",
      "importanceScore": 66,
      "importanceTier": "CRITICAL"
    }
  ]
} as const;
