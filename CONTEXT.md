# Kritzel

Kritzel is a self-hosted, ad-free draw-and-guess party game for teams. This glossary is the project's shared language: specs, code identifiers, tests and UI copy use these terms and no synonyms.

## Language

### People

**Player**:
A person seated in a room who takes turns drawing and guessing and has a score.
_Avoid_: User, member, participant

**Spectator**:
A person in a room who watches and chats but never draws, guesses or scores.
_Avoid_: Viewer, observer, guest

**Host**:
The one player who may change settings, start the game and kick others.
_Avoid_: Owner, admin, leader

**Drawer**:
The player whose turn it is to draw the word.
_Avoid_: Artist, painter

**Guesser**:
A player who is eligible to guess in the current turn.
_Avoid_: Solver

**Bot**:
A computer-controlled player (roadmap; not part of v1).
_Avoid_: AI, CPU, NPC

### Rooms

**Room**:
A private space, reachable only by its room code, in which one group plays.
_Avoid_: Lobby (as a noun for the space), session, table, match

**Room code**:
The six-character identifier that grants entry to a room.
_Avoid_: PIN, room id, invite code

**Lobby**:
The phase of a room in which no game is running and settings can be changed.
_Avoid_: Waiting room

**Seat**:
A player's place in a room, including nickname, avatar and score; it survives a short disconnect.
_Avoid_: Slot

**Grace period**:
The time a seat stays reserved after its player disconnects.
_Avoid_: Timeout

**Settings**:
The host-controlled rules of a room's next game.
_Avoid_: Config, options

### Game structure

**Game**:
One complete playthrough from the first turn to the results, made of rounds.
_Avoid_: Match, session

**Round**:
One pass in which every player is the drawer once.
_Avoid_: Lap

**Turn**:
One drawer drawing one word while the others guess.
_Avoid_: Round (for a single drawing), go

**Phase**:
The current step of a room: lobby, choosing, drawing, turn end or game end.
_Avoid_: State, stage

**Results**:
The final ranking shown at game end.
_Avoid_: Scoreboard (that is the live list during a game), leaderboard

**Podium**:
The top three players in the results.

### Words

**Word**:
The secret term the drawer draws; it may consist of several written words.
_Avoid_: Term, prompt, solution

**Word choice**:
One of the words offered to the drawer at the start of a turn.
_Avoid_: Option

**Word list**:
A built-in set of words for one language and one difficulty.
_Avoid_: Dictionary, deck

**Custom words**:
Words the host adds to a room for its games.

**Mask**:
The word as guessers see it: hidden letters as blanks, revealed letters shown.
_Avoid_: Placeholder, blanks

**Hint**:
One letter of the mask revealed during a turn.
_Avoid_: Clue, tip

**Guess**:
A chat message sent by a guesser during the drawing phase, checked against the word.
_Avoid_: Answer, attempt

**Close guess**:
A wrong guess that is within a small edit distance of the word.
_Avoid_: Near miss, almost

**Guessed channel**:
The chat channel only the drawer and players who already guessed can read during a turn.
_Avoid_: Winners chat, secret chat

### Drawing

**Canvas**:
The fixed-size logical drawing surface of a turn.
_Avoid_: Board, whiteboard

**Op**:
One atomic drawing action: a stroke, a fill, a clear, an undo or a redo.
_Avoid_: Action, command, event

**Stroke**:
One continuous line drawn with the brush or eraser from pointer-down to pointer-up.
_Avoid_: Line, path

**Op log**:
The ordered list of ops that fully describes a turn's drawing.
_Avoid_: History, drawing data

**Drawing**:
The picture produced by replaying an op log.
_Avoid_: Image, sketch, picture

### Social

**Reaction**:
A short-lived emoji any participant sends over the canvas during a turn.
_Avoid_: Emote

**Like**:
A player's thumbs-up or thumbs-down verdict on the current drawing.
_Avoid_: Vote, rating

**Gallery**:
The collection of all drawings of a game, shown with the results.
_Avoid_: Album, recap

### Solo

**Solo run**:
One single-player game in which the computer replays ten drawings and the player guesses each.
_Avoid_: Solo game, practice

**Replay**:
The animated redrawing of a stored drawing, stroke by stroke.
_Avoid_: Playback
