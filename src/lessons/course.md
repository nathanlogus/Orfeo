# Pliage Lessons

The course behind the Learn tab, in two tracks. **Reading music** goes from a first note to sight-reading. **Piano skills** teaches technique, scales, chords, theory and grooves. Piano and keyboard only.

The explanations and numbered exercises are original to Pliage. Songs are traditional or long out of copyright, arranged here from scratch. Sources and rules for adding pieces are in [Sources](#sources).

## How a lesson works

A lesson takes 5 to 10 minutes and runs these steps in order, skipping any it doesn't have:

| Step | What the student does | How it's checked |
|---|---|---|
| **Hear** | Listens to the exercise with the score showing, following the cursor | Not scored |
| **Learn** | Reads one idea, shown on a small score | Not scored |
| **Drill** | A note appears; they press that key. Other drills tap rhythms or name what they see | Wrong key is a miss. 90% to pass, over 5 to 20 prompts |
| **Play** | Plays the exercise with wait-for-notes, then in time with the roll hidden | 90%, twice in a row, in time |

Rules for every lesson:

- A lesson's Hear step plays its exercise, so lessons only spell it out when it's different.
- About 30% of Drill prompts come from earlier lessons, and notes missed recently come up more often.
- A lesson with no exercise passes on its Drill alone. A lesson built on a piece from the [song shelf](#song-shelf) passes on that piece.
- A track starts under a `## Track:` heading, and every unit below it belongs to it. Tracks don't depend on each other: each opens at its first unit.
- Units unlock in order inside a track. Anyone can skip ahead by passing a unit's last lesson.
- Before Unit 4, students play note lengths by ear from Hear; Unit 4 then names them.

Notes use scientific pitch: Middle C is C4. Exercises are alphaTex, which alphaTab reads directly.

The app reads this file: `course.ts` parses each lesson, and `courseTest.ts` checks every exercise. **Check** sets a lesson's drill and **Mode** changes its steps: `no-hear` skips Hear, `sight` skips Hear and the wait-for-notes play, and `hide-bar` hides the bar being played. **Tool** adds a link from the Learn step to `chords` (Chord Explorer), `scales` (Scale Explorer) or `starmap`.

Three Checks are mostly for Piano skills:

- `chords treble C4+E4+G4 Am=A3+C4+E4` asks for chords at once. Without a name it shows the staff and wants those keys. With a name (`_` for a space) it asks by name and takes any octave or inversion.
- `touch treble soft loud : C4 D4 E4 F4 G4` scores how a phrase was played. Styles are `soft`, `loud`, `even`, `legato`, `staccato` and `pedal`, taken in turn. Only what the keyboard reports is scored: wrong keys are ignored, and a fixed-touch keyboard or a missing pedal passes on the notes alone. The app can't see fingers, wrists or posture, so those are taught in words and never scored.
- `quiz Question? = Right / Wrong / Wrong | [C4 G4] Heard? = Right / Wrong` asks questions in order, with the options shuffled. `[...]` plays those notes first, and `+` joins notes into a chord.

## Unit 1: The keyboard and Middle C

### 1.1 Finding your way around
- **Goal:** Find any C without looking at labels.
- **Learn:** Black keys come in groups of two and three. C is the white key just left of each group of two, and that pattern repeats all the way up the keyboard. Moving right sounds higher.
- **Drill:** Find any C, then Middle C, the one nearest the middle of the keyboard.
- **Check:** keys C

### 1.2 Middle C on the staff
- **Goal:** Read Middle C and play it in time.
- **Learn:** Music is written on five lines called a staff. A higher note sits higher on the staff. Middle C sits on a short line of its own just below the treble staff. Bar lines divide the music into equal groups of beats.
- **Drill:** Middle C on the staff, then the key.
- **Notes:** C4
- **Check:** notes treble C4

```alphatex
\title "Home Note" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 C4 C4 C4 | C4.2 C4.2 | :4 C4 C4 C4.2 | C4.1
```

### 1.3 One step up
- **Goal:** Read D and E by stepping up from Middle C.
- **Learn:** Notes alternate between lines and spaces. One step on the staff is one white key. D hangs under the bottom line, and E sits on it. Right hand: thumb on C, then fingers 2 and 3.
- **Drill:** C4, D4, E4.
- **Notes:** C4 D4 E4
- **Check:** notes treble C4 D4 E4

```alphatex
\title "Three Steps" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 D4 E4 D4 | C4 D4 E4.2 | :4 E4 D4 C4 D4 | E4 D4 C4.2
```

### 1.4 First song: Hot Cross Buns
- **Goal:** Play a whole tune from notation.
- **Learn:** A song is short patterns put together. Look for what repeats: bars 1 and 2 are the same.
- **Drill:** C4, D4, E4, faster.
- **Notes:** C4 D4 E4
- **Check:** notes treble C4 D4 E4

```alphatex
\title "Hot Cross Buns" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 E4 D4 C4.2 | :4 E4 D4 C4.2 | :4 C4 C4 C4 C4 | D4 D4 D4 D4 | E4 D4 C4.2
```

The tune's fast notes are slowed to quarter notes here; the real rhythm returns in 8.1.

## Unit 2: Treble landmarks

### 2.1 Treble G
- **Goal:** Know G4 on sight.
- **Learn:** The treble clef curls around the second line up, and that line is G. Landmarks like this are notes you know instantly, so you can work out any other note from the nearest one.
- **Drill:** C4 and G4.
- **Notes:** C4 G4
- **Check:** notes treble C4 G4

```alphatex
\title "Two Landmarks" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 C4 G4.2 | :4 G4 G4 C4.2 | :4 C4 G4 C4 G4 | C4.1
```

### 2.2 Filling the gap
- **Goal:** Read all five notes under the right hand.
- **Learn:** F is one step below G. Place the hand with one finger per key, thumb on C and little finger on G. This is C position.
- **Drill:** C4 to G4.
- **Notes:** C4 D4 E4 F4 G4
- **Check:** notes treble C4 D4 E4 F4 G4

```alphatex
\title "Five Finger Walk" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 D4 E4 F4 | G4.1 | :4 G4 F4 E4 D4 | C4.1 | :4 E4 F4 G4 F4 | E4 D4 C4.2
```

### 2.3 Ode to Joy, right hand
- **Goal:** Read eight bars in C position.
- **Learn:** Nearly every note moves by one step. Watch the direction of the line and you need to name very few notes.
- **Drill:** C4 to G4, faster.
- **Notes:** C4 D4 E4 F4 G4
- **Check:** notes treble C4 D4 E4 F4 G4

```alphatex
\title "Ode to Joy" \tempo 76 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4 D4 D4.2 | :4 E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4 C4 C4.2
```

Bars 4 and 8 are simplified here; the real rhythm returns in 8.2.

### 2.4 Treble C
- **Goal:** Know C5, and read the notes between G4 and C5.
- **Learn:** C5 sits in the third space, right in the middle of the staff. Move the thumb up to G: the hand can travel, and notation doesn't need the same position forever.
- **Drill:** C4, G4, C5, then A4 and B4.
- **Notes:** G4 A4 B4 C5
- **Check:** notes treble C4 G4 A4 B4 C5

```alphatex
\title "Up to Treble C" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 G4 A4 B4 C5 | C5.1 | :4 C5 B4 A4 G4 | G4.1 | :4 G4 A4 B4 A4 | C5 B4 C5.2 | :4 C5 B4 A4 G4 | G4.1
```

## Unit 3: Bass landmarks

### 3.1 The bass clef
- **Goal:** Read the bass staff from its own landmark, F3.
- **Learn:** The left hand usually reads the bass clef. Its two dots sit either side of the fourth line, and that line is F. The same note names sit in different places here than on the treble staff, so don't carry them over. Middle C sits just above this staff.
- **Drill:** C4 and F3 in bass clef.
- **Notes:** F3 C4
- **Check:** notes bass F3 C4

```alphatex
\title "Bass Landmarks" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef F4
:4 C4 C4 F3.2 | :4 F3 F3 C4.2 | :4 C4 F3 C4 F3 | F3.1
```

### 3.2 Bass C and the left hand
- **Goal:** Read all five notes under the left hand.
- **Learn:** C3 sits in the second space. Place the left hand with the little finger on C3 and the thumb on G3. The fingers now run the opposite way from the right hand.
- **Drill:** C3 to G3.
- **Notes:** C3 D3 E3 F3 G3
- **Check:** notes bass C3 D3 E3 F3 G3

```alphatex
\title "Left Hand Walk" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef F4
:4 C3 D3 E3 F3 | G3.1 | :4 G3 F3 E3 D3 | C3.1 | :4 E3 F3 G3 F3 | E3 D3 C3.2
```

### 3.3 Frère Jacques, left hand
- **Goal:** Play a tune with the left hand alone.
- **Learn:** Every phrase here plays twice. Finding repeats means less to read.
- **Drill:** C3 to G3, faster.
- **Notes:** C3 D3 E3 F3 G3
- **Check:** notes bass C3 D3 E3 F3 G3

```alphatex
\title "Frere Jacques" \tempo 76 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef F4
:4 C3 D3 E3 C3 | C3 D3 E3 C3 | E3 F3 G3.2 | :4 E3 F3 G3.2
```

### 3.4 The landmark map
- **Goal:** Know the six landmarks across both staves.
- **Learn:** C2, C3, F3, C4, G4 and C5 are your map. For any other note, find the nearest landmark and count steps from it.
- **Drill:** All six landmarks, in either clef, then one step away from each.
- **Check:** notes grand C2 D2 B2 C3 D3 E3 F3 G3 B3 C4 D4 F4 G4 A4 B4 C5 D5

## Unit 4: Rhythm

In Drill steps here, any key counts; only the timing is scored.

### 4.1 The beat
- **Goal:** Keep a steady beat.
- **Learn:** The beat is the pulse you'd tap your foot to. A quarter note lasts one beat. The top number of the time signature is how many beats fill a bar. Count aloud: 1 2 3 4.
- **Drill:** Tap along with the metronome, then keep going while it fades out.
- **Notes:** C4 G4
- **Check:** tap 4 fade q q q q | q q q q | q q q q | q q q q | q q q q

```alphatex
\title "Steady Beat" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 C4 C4 C4 | G4 G4 G4 G4 | C4 C4 G4 G4 | C4 G4 C4 G4
```

### 4.2 Long notes
- **Goal:** Read quarter, half and whole notes.
- **Learn:** A half note lasts two beats, and a whole note four. Hold the key for the full count, because the note is still sounding through those beats.
- **Drill:** Tap rhythms mixing all three.
- **Notes:** C4 D4 E4
- **Check:** tap 4 h h | w | q q h | h q q | q h q

```alphatex
\title "Long and Short" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:1 C4 | :2 D4 D4 | :4 E4 E4 E4 E4 | :2 D4 D4 | :1 C4
```

### 4.3 Rests
- **Goal:** Count through silence.
- **Learn:** A rest is a beat you count but don't play. Lift the hand, and keep counting.
- **Drill:** Tap rhythms with quarter and half rests.
- **Notes:** C4 D4 E4 F4 G4
- **Check:** tap 4 q qr q qr | h hr | qr q qr q | q q hr | hr q q

```alphatex
\title "Silent Beats" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 r D4 r | E4 r F4 r | G4 r r r | :4 C4 D4 E4 r | C4.2 r.2
```

### 4.4 Three beats in a bar
- **Goal:** Feel 3/4 time.
- **Learn:** In 3/4 each bar has three beats, with the weight on the first: ONE two three. A dot makes a note half as long again, so a dotted half note fills the bar.
- **Drill:** Tap 3/4 rhythms.
- **Notes:** C4 D4 E4 F4
- **Check:** tap 3 q q q | h q | q h | dh | q q q

```alphatex
\title "Little Waltz" \tempo 84 \ts (3 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 D4 E4 | F4 E4 D4 | C4.2 :4 D4 | E4.2{d} | :4 E4 D4 C4 | D4 E4 D4 | C4.2{d}
```

### 4.5 Twinkle, Twinkle
- **Goal:** Put notes and rhythm together in a longer piece.
- **Learn:** The tune has three parts, and the first comes back at the end. Spot the return and it's already learned.
- **Drill:** C4 to A4.
- **Notes:** C4 D4 E4 F4 G4 A4
- **Check:** notes treble C4 D4 E4 F4 G4 A4

```alphatex
\title "Twinkle Twinkle" \tempo 84 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 C4 G4 G4 | A4 A4 G4.2 | :4 F4 F4 E4 E4 | D4 D4 C4.2 | :4 G4 G4 F4 F4 | E4 E4 D4.2 | :4 G4 G4 F4 F4 | E4 E4 D4.2 | :4 C4 C4 G4 G4 | A4 A4 G4.2 | :4 F4 F4 E4 E4 | D4 D4 C4.2
```

## Unit 5: Reading by shape

Drills in this unit name the move, not the note: "up a step", "down a skip".

### 5.1 Steps
- **Goal:** See a step without naming the note.
- **Learn:** A step goes from a line to the next space, or a space to the next line. It moves one white key.
- **Drill:** Two notes appear; choose whether it's a step up or down.
- **Notes:** C4 D4 E4 F4 G4 A4
- **Check:** intervals treble 2 : C4 D4 E4 F4 G4 A4

```alphatex
\title "Steps" \tempo 76 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 D4 E4 F4 | G4 F4 E4 F4 | G4 A4 G4 F4 | E4 D4 C4.2
```

### 5.2 Skips
- **Goal:** See a skip at a glance.
- **Learn:** A skip goes from line to line or space to space, jumping one white key. On the keyboard it's two fingers apart.
- **Drill:** Tell steps from skips.
- **Notes:** C4 D4 E4 F4 G4 A4
- **Check:** intervals treble 2 3 : C4 D4 E4 F4 G4 A4

```alphatex
\title "Skips" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 E4 D4 F4 | E4 G4 F4 A4 | G4 E4 F4 D4 | E4 C4 D4.2 | C4.1
```

### 5.3 Fourths and fifths
- **Goal:** Measure wider moves by eye.
- **Learn:** Count the starting note as 1: C to F is a fourth, C to G a fifth. A fifth goes from line to line with one line between them, and in C position it covers the whole hand.
- **Drill:** Name every move from a step to a fifth.
- **Notes:** C4 D4 E4 F4 G4 A4
- **Check:** intervals treble 2 3 4 5 : C4 D4 E4 F4 G4 A4

```alphatex
\title "Wide Moves" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 F4 C4 G4 | D4 G4 D4 A4 | A4 D4 G4 C4 | F4 C4 G4.2 | :4 E4 G4 C4 F4 | C4.1
```

### 5.4 Mary Had a Little Lamb
- **Goal:** Read a tune by its shape first.
- **Learn:** Before playing, trace the line with a finger: where does it go up, down or stay put? Same-note runs are easy to spot.
- **Drill:** Short four-note shapes shown for a moment, then hidden, played from memory.
- **Notes:** C4 D4 E4 G4
- **Check:** shapes treble C4 D4 E4 G4

```alphatex
\title "Mary Had a Little Lamb" \tempo 84 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 E4 D4 C4 D4 | E4 E4 E4.2 | :4 D4 D4 D4.2 | :4 E4 G4 G4.2 | :4 E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4.1
```

### 5.5 Au clair de la lune
- **Goal:** Check shape reading on a tune they may not know.
- **Learn:** No help this time. Use the steps from 5.4 and play it with no Hear step, so reading does all the work.
- **Drill:** Mixed four-note shapes.
- **Notes:** C4 D4 E4
- **Check:** shapes treble C4 D4 E4
- **Mode:** no-hear

```alphatex
\title "Au clair de la lune" \tempo 80 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 C4 C4 D4 | E4.2 D4.2 | :4 C4 E4 D4 D4 | C4.1 | :4 C4 C4 C4 D4 | E4.2 D4.2 | :4 C4 E4 D4 D4 | C4.1
```

## Unit 6: Hands together

### 6.1 The grand staff
- **Goal:** Read across both staves.
- **Learn:** Piano music joins treble and bass with a brace. Top staff is usually the right hand, bottom the left. Middle C sits between them, and it's the same key whichever staff it's written on.
- **Drill:** Landmarks and neighbours on the grand staff, from either staff at random.
- **Check:** notes grand C3 F3 A3 B3 C4 D4 E4 G4

### 6.2 Taking turns
- **Goal:** Switch reading between staves.
- **Learn:** Read the staff that's playing, and count the rests in the other. A whole rest fills the whole bar.
- **Drill:** One note at a time, jumping between staves.
- **Notes:** C3 D3 E3 F3 G3 C4 D4 E4 F4 G4
- **Check:** notes grand C3 D3 E3 F3 G3 C4 D4 E4 F4 G4

```alphatex
\title "Call and Answer" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 D4 E4 F4 | r.1 | :4 G4 F4 E4 D4 | r.1 | C4.1
\staff { score } \clef F4
r.1 | :4 G3 F3 E3 D3 | r.1 | :4 C3 D3 E3 F3 | C3.1
```

### 6.3 One hand holds
- **Goal:** Hold a left-hand note while the right hand moves.
- **Learn:** Read top to bottom at each beat, as if the notes were one chord. Practise each hand alone first.
- **Drill:** Two notes at once, one on each staff.
- **Notes:** C3 G3 C4 D4 E4 F4 G4
- **Check:** pairs C3 G3 / C4 D4 E4 F4 G4

```alphatex
\title "Holding On" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 D4 E4 F4 | G4.1 | :4 G4 F4 E4 D4 | C4.1
\staff { score } \clef F4
:1 C3 | G3 | G3 | C3
```

### 6.4 Both hands moving
- **Goal:** Move both hands in the same direction.
- **Learn:** Each hand reads its own part, but the fingers differ: the right hand starts on its thumb, the left on its little finger.
- **Drill:** Two-note pairs, faster.
- **Notes:** C3 D3 E3 F3 G3 C4 D4 E4 F4 G4
- **Check:** pairs C3 D3 E3 F3 G3 / C4 D4 E4 F4 G4

```alphatex
\title "Side by Side" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 D4 E4 F4 | G4 F4 E4 D4 | E4 F4 G4 F4 | E4 D4 C4.2
\staff { score } \clef F4
:4 C3 D3 E3 F3 | G3 F3 E3 D3 | E3 F3 G3 F3 | E3 D3 C3.2
```

### 6.5 Ode to Joy, both hands
- **Goal:** Play a complete two-hand piece.
- **Learn:** Practise each hand alone, then together slowly. Speed comes last.
- **Drill:** The pairs from this piece.
- **Notes:** C3 G3 C4 D4 E4 F4 G4
- **Check:** pairs C3 G3 / C4 D4 E4 F4 G4

```alphatex
\title "Ode to Joy, Both Hands" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4 D4 D4.2 | :4 E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4 C4 C4.2
\staff { score } \clef F4
:1 C3 | G3 | C3 | G3 | C3 | G3 | C3 | :4 G3 C3 C3.2
```

### 6.6 First real studies
- **Goal:** Read a piece written for students.
- **Piece:** Beyer, Kinderlied, from Op. 101.
- **File:** beyer-kinderlied.musicxml

## Unit 7: Sharps, flats and keys

### 7.1 Sharps, flats and naturals
- **Goal:** Read black keys.
- **Learn:** A sharp raises a note to the very next key, and a flat lowers it. C sharp and D flat are the same key with two names. An accidental lasts until the end of the bar, unless a natural cancels it.
- **Drill:** Notes with sharps and flats from C4 to E4.
- **Notes:** C4 C#4 D4 D#4 E4
- **Check:** notes treble C4 C#4 Db4 D4 D#4 Eb4 E4

```alphatex
\title "Black Keys" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 C#4 D4 D#4 | E4 D#4 D4 C#4 | C4 Db4 D4 Eb4 | E4 Eb4 D4 Db4 | C4.1
```

### 7.2 G major: one sharp
- **Goal:** Read a key signature.
- **Learn:** The sharps or flats at the start of each line apply to every note of that name, in every octave. One sharp, on F, means G major. A scale is the ladder of notes a key uses.
- **Drill:** Notes in G major, with F# never marked beside the note.
- **Notes:** G4 A4 B4 C5 D5 E5 F#5 G5
- **Check:** notes treble key=G G4 A4 B4 C5 D5 E5 F#5 G5

```alphatex
\title "G Major Scale" \tempo 66 \ks G \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 G4 A4 B4 C5 | D5 E5 F#5 G5 | G5 F#5 E5 D5 | C5 B4 A4 G4 | G4.1
```

### 7.3 F major: one flat
- **Goal:** Read a flat key.
- **Learn:** One flat, on B, means F major. Same tune as 4.5, new key: moving a tune to another key changes the notes, not the song.
- **Drill:** Notes in F major.
- **Notes:** F4 G4 A4 Bb4 C5 D5
- **Check:** notes treble key=F F4 G4 A4 Bb4 C5 D5

```alphatex
\title "Twinkle in F" \tempo 80 \ks F \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 F4 F4 C5 C5 | D5 D5 C5.2 | :4 Bb4 Bb4 A4 A4 | G4 G4 F4.2 | :4 C5 C5 Bb4 Bb4 | A4 A4 G4.2 | :4 C5 C5 Bb4 Bb4 | A4 A4 G4.2 | :4 F4 F4 C5 C5 | D5 D5 C5.2 | :4 Bb4 Bb4 A4 A4 | G4 G4 F4.2
```

### 7.4 D major: two sharps
- **Goal:** Hold two sharps in mind.
- **Learn:** Sharps always appear in the same order: F, then C, then G. Two sharps means D major.
- **Drill:** Notes in D major.
- **Notes:** D4 E4 F#4 G4 A4
- **Check:** notes treble key=D D4 E4 F#4 G4 A4 B4 C#5 D5

```alphatex
\title "Ode to Joy in D" \tempo 76 \ks D \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 F#4 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | F#4 E4 E4.2 | :4 F#4 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | E4 D4 D4.2
```

### 7.5 B-flat major: two flats
- **Goal:** Read two flats.
- **Learn:** Flats also keep an order: B, then E, then A. Two flats means B-flat major.
- **Drill:** Notes in B-flat major.
- **Notes:** Bb4 C5 D5 Eb5 F5
- **Check:** notes treble key=Bb Bb4 C5 D5 Eb5 F5

```alphatex
\title "B Flat Walk" \tempo 66 \ks Bb \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 Bb4 C5 D5 Eb5 | F5.1 | :4 F5 Eb5 D5 C5 | Bb4.1
```

### 7.6 A minor
- **Goal:** Hear major and minor, and read a minor key.
- **Learn:** A minor shares C major's empty key signature but centres on A, and it sounds darker. Its seventh note is often raised to G#, written beside the note each time.
- **Drill:** Notes in A minor, including G#.
- **Notes:** G#4 A4 B4 C5 D5 E5
- **Check:** notes treble G#4 A4 B4 C5 D5 E5

```alphatex
\title "Minor Mood" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 A4 B4 C5 D5 | E5.1 | :4 E5 D5 C5 B4 | A4.1 | :4 A4 G#4 A4 B4 | C5 B4 A4.2
```

## Unit 8: Faster rhythms

### 8.1 Eighth notes
- **Goal:** Play two even notes in one beat.
- **Learn:** Two eighth notes fill one beat. Count "1 and 2 and". Now Hot Cross Buns has its real rhythm.
- **Drill:** Tap rhythms mixing eighths and quarters.
- **Notes:** C4 D4 E4
- **Check:** tap 4 e e e e q q | q q e e e e | e e q e e q | q e e q e e | e e e e h

```alphatex
\title "Hot Cross Buns, Real Rhythm" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 E4 D4 C4.2 | :4 E4 D4 C4.2 | :8 C4 C4 C4 C4 D4 D4 D4 D4 | :4 E4 D4 C4.2
```

### 8.2 Dotted quarter notes
- **Goal:** Play long-short rhythms.
- **Learn:** A dotted quarter lasts a beat and a half, and the eighth after it finishes the second beat. Count "1 and 2 and": the second note lands on the second "and".
- **Drill:** Tap dotted rhythms.
- **Notes:** C4 D4 E4 F4 G4
- **Check:** tap 4 dq e h | dq e dq e | q dq e q | h dq e | dq e q q

```alphatex
\title "Ode to Joy, Real Rhythm" \tempo 80 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4.4{d} D4.8 D4.2 | :4 E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4.4{d} C4.8 C4.2
```

### 8.3 Ties and pickups: When the Saints
- **Goal:** Read ties and start before bar 1.
- **Learn:** A tie joins two notes of the same pitch, so you play once and hold through both. A pickup is a short first bar: count the missing beats, and start partway through.
- **Drill:** Tap tied rhythms.
- **Notes:** C4 D4 E4 F4 G4
- **Check:** tap 4 h~q q | q h~q | h~h | q q~q q | w~h h

```alphatex
\title "When the Saints" \tempo 100 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
\ac :4 C4 E4 F4 | G4.1 | G4{t}.4 C4 E4 F4 | G4.1 | G4{t}.4 C4 E4 F4 | G4.2 E4.2 | C4.2 E4.2 | D4.1 | D4{t}.4 E4 E4 D4 | C4.2 :4 C4 E4 | G4.2 :4 G4 F4 | F4{t}.2 :4 E4 F4 | G4.2 E4.2 | C4.2 D4.2 | C4.1
```

### 8.4 Minuet in G, right hand
- **Goal:** Read a real period piece.
- **Learn:** It uses everything so far: 3/4, G major, eighth notes. Bars 1 and 3 share a shape, so learn one and adapt it.
- **Drill:** Notes in G major from F#4 up to G5.
- **Notes:** F#4 G4 A4 B4 C5 D5 E5 F#5 G5
- **Check:** notes treble key=G F#4 G4 A4 B4 C5 D5 E5 F#5 G5

```alphatex
\title "Minuet in G" \tempo 96 \ks G \ts (3 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 D5 G4.8 A4.8 B4.8 C5.8 | :4 D5 G4 G4 | :4 E5 C5.8 D5.8 E5.8 F#5.8 | :4 G5 G4 G4 | :4 C5 D5.8 C5.8 B4.8 A4.8 | :4 B4 C5.8 B4.8 A4.8 G4.8 | :4 F#4 G4.8 A4.8 B4.8 G4.8 | A4.2{d}
```

## Unit 9: Reading expression

Expression isn't scored yet: these lessons teach what the marks mean, and the app listens only for the right notes at the right time.

### 9.1 Dynamics
- **Goal:** Read loud and soft.
- **Learn:** *p* means soft and *f* means loud. *mp* and *mf* sit between them. A long opening wedge means get louder, a closing one softer.
- **Notes:** C4 D4 E4 F4 G4

```alphatex
\title "Soft and Loud" \tempo 66 \ts (4 4)
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4{dy p} D4 E4 F4 | G4.1 | :4 G4{dy f} F4 E4 D4 | C4.1
```

### 9.2 Articulation
- **Goal:** Read how a note should be struck.
- **Learn:** A dot above or below a note means staccato: short and detached. A small > sign means an accent: strike it stronger. A curved line over different notes is a slur, meaning join them smoothly.
- **Notes:** C4 D4 E4 F4 G4

```alphatex
\title "Short and Strong" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4{st} D4{st} E4{st} F4{st} | G4.1 | :4 G4{ac} F4 E4{ac} D4 | C4.1
```

### 9.3 Repeats
- **Goal:** Follow a map through the music.
- **Learn:** A repeat sign means go back to the matching sign, or the start, and play that section again. D.C. means go back to the beginning, and Fine marks where to stop.
- **Notes:** C4 D4 E4 F4 G4

```alphatex
\title "Round Again" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
\ro :4 C4 D4 E4 F4 | \rc 2 :4 G4 F4 E4 D4 | C4.1
```

### 9.4 A piece with feeling
- **Goal:** Play the marks in a real piece, not only the notes.
- **Piece:** Schumann, Melody, Op. 68 No. 1.
- **File:** schumann-melodie.musicxml

## Unit 10: Sight-reading

### 10.1 The 30-second scan
- **Goal:** Plan before the first note.
- **Learn:** Check, in order: key signature, time signature, the hardest bar, and any repeats. Then pick a tempo the hardest bar can survive.
- **Drill:** A score appears for 30 seconds, then answer: how many sharps or flats, and how many beats in a bar?
- **Check:** scan

### 10.2 Keep going
- **Goal:** Never stop for a mistake.
- **Learn:** In sight-reading the beat matters more than any single note. If you miss one, skip it and catch the next beat.
- **Piece:** Türk, Hans ohne Sorgen. Wait-for-notes is off for this step.
- **File:** turk-hans-ohne-sorgen.musicxml
- **Mode:** sight

### 10.3 Reading ahead
- **Goal:** Look ahead of the hands.
- **Learn:** Good readers look several notes ahead of what they're playing. The current bar now hides as it's played, so your eyes have to be on the next bar.
- **Notes:** C4 D4 E4 F4 G4 A4
- **Mode:** hide-bar

```alphatex
\title "Look Ahead" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 E4 D4 F4 | E4 G4 F4 A4 | G4 F4 E4 D4 | E4 F4 G4.2 | :4 G4 A4 G4 F4 | E4 D4 E4 C4 | D4 E4 F4 D4 | C4.1
```

### 10.4 Reading in chunks
- **Goal:** Read groups of notes as one thing.
- **Learn:** Scales, chords and broken chords are patterns you can take in at a glance. A chord read as a shape is one idea, not three notes.
- **Drill:** Name the shape: scale, chord or broken chord.
- **Notes:** B3 C4 D4 E4 F4 G4 A4
- **Check:** chunks

```alphatex
\title "Chunks" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:2 (C4 E4 G4) (C4 F4 A4) | :2 (B3 D4 G4) (C4 E4 G4) | :4 C4 E4 G4 E4 | :4 C4 F4 A4 F4 | :4 B3 D4 G4 D4 | :1 (C4 E4 G4)
```

### 10.5 Graduation
- **Goal:** Read a new piece, alone.
- **Piece:** Burgmüller, La Candeur, Op. 100 No. 1, first attempt in time.
- **File:** burgmuller-candeur.musicxml

## Track: Piano skills

A second path, open from the first day: technique, scales, chords, theory and grooves. It helps to read a little music first, but every exercise can be heard before it's played.

## Unit 11: First technique

The app hears which keys go down, when they go down and up, and how fast they're struck. It can't see your hands, so finger numbers and posture are yours to watch.

### 11.1 Five-finger position
- **Goal:** Settle both hands over five keys.
- **Learn:** Sit with your elbows level with the keys and your shoulders low. Curve your fingers as if holding a small ball. Fingers are numbered from the thumb, 1, to the little finger, 5, on both hands. Right thumb goes on C4, with one finger per key up to G4. Left little finger goes on C3, with the thumb on G3. The app can't see your fingers, so check them yourself: round knuckles, loose wrists.
- **Drill:** C position in both hands.
- **Notes:** C3 D3 E3 F3 G3 C4 D4 E4 F4 G4
- **Check:** notes grand C3 D3 E3 F3 G3 C4 D4 E4 F4 G4

```alphatex
\title "Mirror Hands" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 D4 E4 F4 | G4 F4 E4 D4 | C4 D4 E4 F4 | :1 G4
\staff { score } \clef F4
:4 G3 F3 E3 D3 | C3 D3 E3 F3 | G3 F3 E3 D3 | :1 C3
```

Here the hands mirror each other, so the same finger plays in both hands at every beat.

### 11.2 Thumb under
- **Goal:** Pass the thumb under to play past five notes.
- **Learn:** Five fingers run out. To go on, slide the thumb under the hand while finger 3 is still down, and let the hand glide over it. For C major in the right hand, play 1 2 3 on C D E, put the thumb on F, then go on 1 2 3 4 5 to the top. Coming down, finger 3 reaches over the thumb. Keep the wrist level and the elbow quiet. The app can't tell which finger you used, so go slowly and watch.
- **Drill:** The white keys from C4 to C5.
- **Notes:** C4 D4 E4 F4 G4 A4 B4 C5
- **Check:** notes treble C4 D4 E4 F4 G4 A4 B4 C5

```alphatex
\title "Thumb Under" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4 | :8 C4 D4 E4 F4 G4 F4 E4 D4 | :2 C4 r
```

### 11.3 Legato and staccato
- **Goal:** Join notes, then separate them.
- **Learn:** Legato means joined: one key comes up just as the next goes down, with no gap. Staccato means short and light: the key springs back up straight away, with a small drop from the wrist. The app sees each key go down and come up, so this drill really listens for the difference.
- **Drill:** Phrases that alternate smooth and short.
- **Notes:** C4 D4 E4 F4 G4
- **Check:** touch treble legato staccato : C4 D4 E4 F4 G4

```alphatex
\title "Joined and Apart" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 D4 E4 F4 | :1 G4 | :4 G4{st} F4{st} E4{st} D4{st} | :4 C4{st} r r r | :4 C4 E4 D4 F4 | :1 G4
```

### 11.4 Dynamics and touch
- **Goal:** Play soft and loud on purpose.
- **Learn:** On a piano, the speed of the key sets the loudness. For soft notes, start close to the key and press slowly. For loud notes, let the weight of the arm fall in, without stabbing. Your keyboard reports that speed, so the drill compares each phrase with the one before. Some keyboards send one fixed touch; if yours does, the app can't tell, and the drill passes on the notes alone.
- **Drill:** A soft phrase, then a loud one, and so on.
- **Notes:** C4 D4 E4 F4 G4
- **Check:** touch treble soft loud : C4 D4 E4 F4 G4

```alphatex
\title "Quiet and Bold" \tempo 66 \ts (4 4)
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4{dy p} D4 E4 F4 | :1 G4 | :4 G4{dy f} F4 E4 D4 | :1 C4 | :4 E4{dy mp} F4 G4 F4 | :1 E4
```

### 11.5 Even fingers
- **Goal:** Make all five fingers sound alike.
- **Learn:** Fingers 4 and 5 are weaker, and the hand wants to rush past them. Patterns that hop between fingers train them to match. Go slowly and aim for every note at the same loudness and the same distance apart. Speed comes by itself, later.
- **Drill:** A short pattern, as even as you can make it.
- **Notes:** C4 D4 E4 F4 G4
- **Check:** touch treble even : C4 E4 D4 F4 E4 G4

```alphatex
\title "Stepping Thirds" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:8 C4 E4 D4 F4 E4 G4 F4 E4 | D4 F4 E4 G4 F4 E4 D4 C4 | C4 E4 D4 F4 E4 G4 F4 E4 | D4 E4 F4 E4 D4 E4 D4 C4 | :1 C4
```

## Unit 12: Scales

A scale is the ladder of notes a piece of music lives on. Use the thumb-under from 11.2 whenever a scale runs past five notes.

### 12.1 The major scale pattern
- **Goal:** Build a major scale from any note.
- **Learn:** A half step is the very next key, black or white. A whole step skips one key. Every major scale climbs whole, whole, half, whole, whole, whole, half. Start on C and you stay on white keys. Start on G and the pattern needs one black key: F sharp.
- **Drill:** Questions on the pattern.
- **Check:** quiz A major scale starts with which steps? = Whole, whole, half / Half, whole, whole / Whole, half, whole | From E up to F is = A half step / A whole step | From C up to D is = A whole step / A half step | G major needs one sharp. Which note? = F sharp / C sharp / G sharp | F major needs one flat. Which note? = B flat / E flat / A flat | How many notes before the scale repeats? = Seven / Five / Eight
- **Notes:** C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F#5 G5
- **Tool:** scales

```alphatex
\title "Same Ladder, New Start" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4 | G4 A4 B4 C5 | D5 E5 F#5 G5 | G5 F#5 E5 D5 | C5 B4 A4 G4
```

### 12.2 Natural minor
- **Goal:** Hear and play the natural minor scale.
- **Learn:** Natural minor climbs whole, half, whole, whole, half, whole, whole. Play the white keys from A to A and you have it: the same notes as C major, with a different home, and a darker colour. From any major scale, lower the third, sixth and seventh notes to reach its parallel minor.
- **Drill:** A natural minor, A4 to A5.
- **Notes:** A4 B4 C5 D5 E5 F5 G5 A5
- **Check:** notes treble A4 B4 C5 D5 E5 F5 G5 A5
- **Tool:** scales

```alphatex
\title "White Keys From A" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 A4 B4 C5 D5 | E5 F5 G5 A5 | A5 G5 F5 E5 | D5 C5 B4 A4 | :8 A4 C5 E5 C5 :4 A4 E5 | :1 A4
```

### 12.3 Pentatonic scales
- **Goal:** Play the five-note scales.
- **Learn:** Leave out the fourth and seventh notes of a major scale and five remain: C D E G A. That's major pentatonic. The same five notes from A, A C D E G, are minor pentatonic. With no half steps left, nothing clashes, so almost any order sounds good. Jam's Rock band uses minor pentatonic, and its Soul band uses major.
- **Drill:** Short shapes from A minor pentatonic, shown and then hidden.
- **Notes:** C4 D4 E4 G4 A4 C5 D5 E5 G5
- **Check:** shapes treble A4 C5 D5 E5 G5
- **Tool:** scales

```alphatex
\title "Five Notes" \tempo 76 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 D4 E4 G4 | A4 G4 E4 D4 | A4 C5 D5 E5 | G5 E5 D5 C5 | :2 A4 E5 | :1 A4
```

### 12.4 The blues scale
- **Goal:** Add the blue note.
- **Learn:** Take a minor pentatonic and add one note, the flattened fifth. In C that gives C, E flat, F, G flat, G, B flat. The G flat is the blue note. It's a note to lean on and pass through, more than a place to stop.
- **Drill:** The C blues scale.
- **Notes:** C4 Eb4 F4 Gb4 G4 Bb4 C5
- **Check:** notes treble C4 Eb4 F4 Gb4 G4 Bb4 C5
- **Tool:** scales

```alphatex
\title "Blue Note" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 Eb4 F4 Gb4 | :4 G4 Bb4 :2 C5 | :4 C5 Bb4 G4 Gb4 | :4 F4 Eb4 :2 C4 | :8 C4 Eb4 F4 Gb4 G4 Gb4 F4 Eb4 | :1 C4
```

### 12.5 Modes: Dorian and Mixolydian
- **Goal:** Hear how a new home note changes the mood.
- **Learn:** Play the white keys from D to D: that's Dorian, a minor scale with a brighter sixth. Play them from G to G: that's Mixolydian, a major scale with a lowered seventh. The notes are C major's, but a held bass note moves the home. Jam's Funk band plays Dorian.
- **Drill:** Questions on the two modes.
- **Check:** quiz White keys from D to D make which mode? = Dorian / Mixolydian / Major | White keys from G to G make which mode? = Mixolydian / Dorian / Minor | Dorian sounds like minor with a raised = Sixth / Second / Fifth | Mixolydian sounds like major with a lowered = Seventh / Third / Fourth | Which scale gives these modes their white keys? = C major / G major / F major
- **Notes:** D3 G3 D4 E4 F4 G4 A4 B4 C5 D5 E5
- **Tool:** scales

```alphatex
\title "New Home" \tempo 76 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 D4 E4 F4 G4 | A4 B4 A4 G4 | :4 F4 E4 :2 D4 | :4 G4 A4 B4 C5 | D5 E5 D5 C5 | :4 B4 A4 :2 G4
\staff { score } \clef F4
:1 D3 | D3 | D3 | G3 | G3 | G3
```

### 12.6 Key signatures
- **Goal:** Name a major key from its sharps or flats.
- **Learn:** Sharps always arrive in the order F, C, G, D, A, E, B. Flats run the other way: B, E, A, D, G, C, F. With sharps, go up a half step from the last sharp to find the key. With flats, the second-to-last flat names the key, and one flat alone means F major. Each signature also belongs to a minor key, three half steps below the major one.
- **Drill:** Questions on signatures, then A major, with three sharps.
- **Check:** quiz The last sharp is C sharp. Which major key? = D / C / A | The last sharp is G sharp. Which major key? = A / G / E | The flats are B, E and A. Which major key? = E flat / A flat / B flat | One flat means which major key? = F / B flat / C | No sharps or flats belongs to C major and which minor? = A minor / E minor / D minor | Which sharp always comes first? = F sharp / C sharp / B sharp
- **Notes:** A4 B4 C#5 D5 E5 F#5 G#5 A5

```alphatex
\title "Three Sharps" \tempo 72 \ks A \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 A4 B4 C#5 D5 | E5 F#5 G#5 A5 | A5 G#5 F#5 E5 | D5 C#5 B4 A4 | :2 A4 E5 | :1 A4
```

## Unit 13: Chords

A chord is notes played together. Most of the songs you know are built from a handful of them.

### 13.1 Triads
- **Goal:** Build major and minor triads.
- **Learn:** Stack two thirds and you have a triad: root, third, fifth. Major has four half steps, then three. Minor swaps them: three, then four. Two stacks of three make a tense diminished chord. Use fingers 1, 3 and 5, and let them land together.
- **Drill:** Triads on the staff.
- **Notes:** C4 D4 E4 F4 G4 A4 B4 C5 D5 E5
- **Check:** chords treble C4+E4+G4 C4+Eb4+G4 D4+F4+A4 G4+B4+D5 F4+A4+C5 A4+C5+E5
- **Tool:** chords

```alphatex
\title "Three Note Stacks" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:2 (C4 E4 G4) (F4 A4 C5) | (G4 B4 D5) (C4 E4 G4) | (A4 C5 E5) (D4 F4 A4) | (G4 B4 D5) (C4 E4 G4)
```

### 13.2 Seventh chords
- **Goal:** Add a fourth note to a triad.
- **Learn:** One more third on top makes a seventh chord. A major seventh, like Cmaj7, sounds dreamy. A minor seventh, like Dm7, sounds warm. A dominant seventh, like G7, is a major triad with a lowered seventh, and it sounds restless. It wants to move.
- **Drill:** Play each chord by name.
- **Notes:** G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5
- **Check:** chords treble Cmaj7=C4+E4+G4+B4 Dm7=D4+F4+A4+C5 G7=G3+B3+D4+F4 Am7=A3+C4+E4+G4 C7=C4+E4+G4+Bb4 Fmaj7=F4+A4+C5+E5
- **Tool:** chords

```alphatex
\title "Four Note Stacks" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:1 (C4 E4 G4 B4) | (D4 F4 A4 C5) | (G3 B3 D4 F4) | (C4 E4 G4 B4) | (A3 C4 E4 G4) | (D4 F4 A4 C5) | (G3 B3 D4 F4) | (C4 E4 G4 B4)
```

### 13.3 Inversions
- **Goal:** Play one chord in three shapes.
- **Learn:** An inversion keeps a chord's notes and changes which is lowest. C E G is root position. Move C to the top for E G C, first inversion. Move E up as well for G C E, second inversion. It's still C major, and now your hand barely has to travel.
- **Drill:** The exact shape on the staff.
- **Notes:** G3 B3 C4 D4 E4 F4 G4 A4 B4 C5 E5 F5
- **Check:** chords treble C4+E4+G4 E4+G4+C5 G4+C5+E5 F4+A4+C5 A4+C5+F5 C4+F4+A4 G3+B3+D4 B3+D4+G4
- **Tool:** chords

```alphatex
\title "Turning Over" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:2 (C4 E4 G4) (E4 G4 C5) | (G4 C5 E5) (E4 G4 C5) | (F4 A4 C5) (A4 C5 F5) | (F4 A4 C5) (C4 F4 A4) | (G3 B3 D4) (B3 D4 G4) | (D4 G4 B4) (B3 D4 G4) | :1 (C4 E4 G4)
```

### 13.4 Voice leading
- **Goal:** Move between chords with as little travel as you can.
- **Learn:** Think of each finger as a singer. Keep any note the next chord shares, and move the others to the nearest place. From C to F, C stays, E rises to F, and G rises to A. The left hand plays the roots, so the right hand can stay in one spot, in whichever inversion is closest.
- **Drill:** Close chords in a row.
- **Notes:** G2 A2 C3 D3 F3 G3 A3 B3 C4 D4 E4 F4 G4 A4
- **Check:** chords treble C4+E4+G4 C4+F4+A4 B3+D4+G4 A3+C4+E4 A3+D4+F4
- **Tool:** chords

```alphatex
\title "Short Moves" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:2 (C4 E4 G4) (C4 F4 A4) | (B3 D4 G4) (C4 E4 G4) | (A3 C4 E4) (A3 D4 F4) | (B3 D4 G4) (C4 E4 G4)
\staff { score } \clef F4
:2 C3 F3 | G3 C3 | A2 D3 | G2 C3
```

### 13.5 Roman numerals
- **Goal:** Name chords by their place in the key.
- **Learn:** Build a triad on each note of a scale and number them. In C major, I is C, ii is Dm, iii is Em, IV is F, V is G, vi is Am. Capitals are major, small letters minor. Numerals let the same progression travel: I IV V I works in any key. In G it's G, C, D, G.
- **Drill:** Play each chord from its numeral.
- **Notes:** C3 D3 F3 G3 A3 B3 C4 D4 E4 F4 F#4 G4 A4
- **Check:** chords treble I_in_C=C4+E4+G4 IV_in_C=F4+A4+C5 V_in_C=G4+B4+D5 vi_in_C=A4+C5+E5 ii_in_C=D4+F4+A4 I_in_G=G4+B4+D5 IV_in_G=C4+E4+G4 V_in_G=D4+F#4+A4
- **Tool:** chords

```alphatex
\title "Numbers Travel" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:2 (C4 E4 G4) (C4 F4 A4) | (B3 D4 G4) (C4 E4 G4) | (B3 D4 G4) (C4 E4 G4) | (A3 D4 F#4) (B3 D4 G4)
\staff { score } \clef F4
:2 C3 F3 | G3 C3 | G3 C3 | D3 G3
```

### 13.6 Four chords, and ii V I
- **Goal:** Play the progressions you'll meet most.
- **Learn:** I V vi IV loops under a huge share of pop songs: in C it's C, G, Am, F. Jazz leans on ii V I instead: Dm7, G7, Cmaj7, a chain that walks home. Notice how a few notes hold still from chord to chord, thanks to voice leading.
- **Drill:** The same two progressions, in G and C, by name.
- **Notes:** F2 G2 A2 C3 D3 A3 B3 C4 D4 E4 F4 G4 A4
- **Check:** chords treble G=G4+B4+D5 D=D4+F#4+A4 Em=E4+G4+B4 C=C4+E4+G4 Dm7=D4+F4+A4+C5 G7=G3+B3+D4+F4 Cmaj7=C4+E4+G4+B4
- **Tool:** chords

```alphatex
\title "The Usual Roads" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:2 (C4 E4 G4) (B3 D4 G4) | (A3 C4 E4) (A3 C4 F4) | (C4 E4 G4) (B3 D4 G4) | (A3 C4 E4) (A3 C4 F4) | :2 (C4 F4 A4) (B3 D4 F4) | :1 (B3 C4 E4)
\staff { score } \clef F4
:2 C3 G2 | A2 F2 | C3 G2 | A2 F2 | :2 D3 G2 | :1 C3
```

### 13.7 The 12-bar blues
- **Goal:** Play the 12-bar form.
- **Learn:** Twelve bars, three chords: four of I, two of IV, two of I, then one each of V, IV, I, and V to turn around. In C that's C7, F7 and G7. The right hand plays two-note shapes, the third and seventh of each chord, and they barely move. Try this form with Jam's Blues band afterwards.
- **Drill:** The three chords by name.
- **Notes:** C3 F3 G3 Eb4 E4 F4 A4 Bb4 B4
- **Check:** chords treble C7=C4+E4+G4+Bb4 F7=F4+A4+C5+Eb5 G7=G3+B3+D4+F4
- **Tool:** chords

```alphatex
\title "Twelve Bars" \tempo 84 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:2 (E4 Bb4) (E4 Bb4) | (E4 Bb4) (E4 Bb4) | (E4 Bb4) (E4 Bb4) | (E4 Bb4) (E4 Bb4) | (Eb4 A4) (Eb4 A4) | (Eb4 A4) (Eb4 A4) | (E4 Bb4) (E4 Bb4) | (E4 Bb4) (E4 Bb4) | (F4 B4) (F4 B4) | (Eb4 A4) (Eb4 A4) | (E4 Bb4) (E4 Bb4) | (F4 B4) (F4 B4)
\staff { score } \clef F4
:1 C3 | C3 | C3 | C3 | F3 | F3 | C3 | C3 | G3 | F3 | C3 | G3
```

## Unit 14: Music theory

Why the notes work. These lessons lean on the scales and chords from the last two units.

### 14.1 Intervals by shape
- **Goal:** Measure a distance by eye and by hand.
- **Learn:** An interval is the distance between two notes, counted from 1 on the lower note. A third is also called a skip. On the staff, odd intervals go line to line or space to space, and even ones go line to space. On the keys, your hand learns the stretch: a fifth is finger 1 to finger 5, an octave a full open hand.
- **Drill:** Name each move, up to an octave.
- **Notes:** C4 D4 E4 F4 G4 A4 B4 C5
- **Check:** intervals treble 3 5 6 8 : C4 D4 E4 F4 G4 A4 B4 C5

```alphatex
\title "Wider and Wider" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 E4 C4 F4 | C4 G4 C4 A4 | C4 C5 B4 G4 | E4 C5 G4 D4 | :1 C4
```

### 14.2 Intervals by ear
- **Goal:** Tell intervals apart by sound.
- **Learn:** Each interval has a character. A major third sounds bright and a minor third sounds sad. A perfect fifth sounds open and hollow. An octave sounds like one note, high and low. A tritone, six half steps, sounds unsettled. Don't count: listen for the colour.
- **Drill:** Listen, then choose. You can hear each one again.
- **Check:** quiz [C4 E4] What did you hear? = Major third / Minor third / Perfect fifth | [C4 Eb4] What did you hear? = Minor third / Major third / Tritone | [C4 G4] What did you hear? = Perfect fifth / Tritone / Octave | [C4 C5] What did you hear? = Octave / Perfect fifth / Major third | [C4 F#4] What did you hear? = Tritone / Perfect fifth / Minor third | [G3 B3] What did you hear? = Major third / Minor third / Tritone | [A3 C4] What did you hear? = Minor third / Major third / Octave | [D4 A4] What did you hear? = Perfect fifth / Octave / Tritone | [F3 F4] What did you hear? = Octave / Perfect fifth / Minor third | [E4 Bb4] What did you hear? = Tritone / Perfect fifth / Major third

### 14.3 Rhythm and syncopation
- **Goal:** Feel notes that land between the beats.
- **Learn:** Most music leans on the beat. Syncopation leans away from it: a note lands on an "and", or a strong beat stays silent. Keep counting 1 and 2 and, tap your foot on the numbers, and let the hand play across them. A tie holds a note over the beat, so you feel the beat go past without playing it.
- **Drill:** Tap rhythms that sit off the beat.
- **Notes:** C4 E4 G4
- **Check:** tap 4 e q e q q | q e q e q | e q q q e | dq e~q q | q e q~e e e

```alphatex
\title "Across the Beat" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 C4 E4 G4 E4 | :8 C4 :4 E4 :8 G4 :2 E4 | :4 C4 :8 E4 :4 G4 :8 E4 :4 C4 | E4.4{d} G4.4{d} E4.4 | :1 C4
```

### 14.4 How keys relate
- **Goal:** Read the circle of fifths.
- **Learn:** Start on C and climb by fifths: G, D, A, E. Each step adds one sharp. Go the other way, down by fifths: F, B flat, E flat. Each step adds one flat. Set out in a ring, that's the circle of fifths. Neighbours differ by only one note, which is why moving to them sounds so natural. A key's IV and V chords sit right beside it.
- **Drill:** Questions on the circle.
- **Check:** quiz One fifth above C is = G / F / D | One fifth above G is = D / A / C | One fifth below C is = F / G / B flat | Going up by a fifth adds = One sharp / One flat / Two sharps | C major's neighbours on the circle are = F and G / D and E / A and E | The relative minor of G major is = E minor / A minor / D minor | How many keys are on the circle? = Twelve / Seven / Eight
- **Notes:** G2 A2 C3 D3 A3 B3 C4 C#4 D4 E4 F#4 G4
- **Tool:** starmap

```alphatex
\title "Round by Fifths" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:2 (C4 E4 G4) (B3 D4 G4) | (A3 D4 F#4) (A3 C#4 E4) | (A3 D4 F#4) (B3 D4 G4) | :1 (C4 E4 G4)
\staff { score } \clef F4
:2 C3 G2 | D3 A2 | D3 G2 | :1 C3
```

### 14.5 Tension and release
- **Goal:** Hear why chords want to move.
- **Learn:** Harmony breathes: home, away, tension, and home again. In G7, B wants to rise a half step to C, and F wants to fall a half step to E. Those two notes make a tritone, and resolving them to C major is the strongest "home" in music. The ear enjoys the pull as much as the arrival.
- **Drill:** Listen to each chord: is it at rest, or does it want to move?
- **Check:** quiz [C4+E4+G4] This chord feels = At rest / Pulled onward | [G3+B3+D4+F4] This chord feels = Pulled onward / At rest | [B3+F4] These two notes want to go to = C and E / D and A | [G3+B3+D4+F4 C4+E4+G4] This ending sounds = Finished / Unfinished | [C4+E4+G4 G3+B3+D4+F4] This ending sounds = Unfinished / Finished | The strongest pull home comes from which chord? = V7 / IV / vi
- **Notes:** G2 A2 C3 D3 F3 G3 A3 B3 C4 D4 E4 F4 G4 A4
- **Tool:** chords

```alphatex
\title "Pull and Rest" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:2 (C4 E4 G4) (C4 F4 A4) | :2 (B3 D4 F4) (C4 E4 G4) | :2 (A3 C4 E4) (A3 D4 F4) | :2 (B3 D4 F4) (C4 E4 G4)
\staff { score } \clef F4
:2 C3 F3 | G3 C3 | A2 D3 | G2 C3
```

## Unit 15: Hands and pedal

Harder technique, now that you know chords. As before, the app judges what the keyboard reports. It can't see your wrist.

### 15.1 Arpeggios
- **Goal:** Spread a chord across the keys.
- **Learn:** An arpeggio plays a chord one note at a time. In the right hand, C E G takes fingers 1 2 3, then the thumb passes under to the next C. Let the wrist glide sideways instead of reaching with the fingers, and keep the thumb's landing quiet. The app listens for even notes; the glide is yours to feel.
- **Drill:** A rising arpeggio, as even as you can.
- **Notes:** F3 G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5 E5
- **Check:** touch treble even : C4 E4 G4 C5 E5 G5

```alphatex
\title "Rolling Up" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:8 C4 E4 G4 C5 E5 C5 G4 E4 | A3 C4 E4 A4 C5 A4 E4 C4 | F3 A3 C4 F4 A4 F4 C4 A3 | G3 B3 D4 G4 B4 G4 D4 B3 | :1 C4
```

### 15.2 A steady left hand
- **Goal:** Keep the left hand going while the right sings.
- **Learn:** Hand independence starts with one hand on autopilot. Practise the left hand until you can talk over it, then add the right. Keep the left a little softer: the tune should sit on top.
- **Drill:** Two notes at once, from each hand.
- **Notes:** A2 B2 C3 F3 G3 C4 D4 E4 F4 G4 A4
- **Check:** pairs C3 G3 / E4 F4 G4 A4

```alphatex
\title "Autopilot" \tempo 66 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:2 E4 G4 | :1 A4 | :2 G4 F4 | :1 E4 | :2 F4 A4 | :2 G4 E4 | :2 F4 D4 | :1 C4
\staff { score } \clef F4
:4 C3 G3 C3 G3 | C3 G3 C3 G3 | B2 G3 B2 G3 | C3 G3 C3 G3 | A2 F3 A2 F3 | C3 G3 C3 G3 | B2 G3 B2 G3 | :4 C3 G3 :2 C3
```

### 15.3 Two rhythms at once
- **Goal:** Play different rhythms in each hand.
- **Learn:** Count the beat out loud, then fit each hand to the count. Here the left plays on the beats and the right often lands between them. Play the hands one at a time, then together, as slowly as it takes.
- **Drill:** Tap the right hand's rhythm while your foot keeps the beat.
- **Notes:** C3 F3 G3 A3 B3 C4 D4 E4 F4 G4 A4
- **Check:** tap 4 q e e q q | e e q e e q | er e er e er e er e | q er e q er e | e q e h

```alphatex
\title "Two Clocks" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 G4 :8 E4 G4 :4 A4 G4 | :8 r E4 r F4 r G4 r A4 | :4 G4 :8 r E4 :4 F4 :8 r D4 | :8 E4 :4 G4 :8 E4 :2 C4
\staff { score } \clef F4
:4 C3 G3 C3 G3 | C3 A3 F3 A3 | G3 B3 G3 B3 | C3 G3 :2 C3
```

### 15.4 Pedalling
- **Goal:** Join chords with the sustain pedal.
- **Learn:** The right pedal keeps notes ringing after the keys come up. Keep your heel on the floor and move from the ankle. To change cleanly, play the new note first, then lift the pedal and press it straight back down. That catches the new note and clears the old one. The app reads the pedal if your keyboard has one. With no pedal plugged in, the drill passes on the notes alone.
- **Drill:** Play each note, then lift and press the pedal.
- **Notes:** C3 F3 G3 C4 D4 E4 F4 G4 A4 B4 C5
- **Check:** touch treble pedal : C4 E4 G4 C5

```alphatex
\title "Change After" \tempo 60 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 E4 G4 C5 G4 | F4 A4 C5 A4 | D4 G4 B4 G4 | :1 (C4 E4 G4)
\staff { score } \clef F4
:1 C3 | F3 | G3 | C3
```

Use the pedal in the play steps if you like. Only the notes and their timing are scored there.

## Unit 16: Grooves: pop, rock, soul, funk

Left-hand patterns that carry a whole song. Learn each left hand alone first, then take it to the matching band in Jam.

### 16.1 Pop: the Alberti bass
- **Goal:** Keep a chord moving with a broken pattern.
- **Learn:** An Alberti bass turns a chord into a rolling figure: low, high, middle, high. It's centuries old and still works under a pop tune, because it fills the space without getting in the way. Keep it light and even. The right hand here plays long notes over I V vi IV.
- **Drill:** Short shapes from a C chord, in the left hand.
- **Notes:** F2 G2 A2 B2 C3 D3 E3 G3 C4 D4 E4 G4 B4 C5
- **Check:** shapes bass C3 E3 G3

```alphatex
\title "Rolling Left" \tempo 76 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:1 E4 | D4 | C4 | C4 | :2 G4 G4 | :2 G4 B4 | :1 C5 | :1 C5
\staff { score } \clef F4
:8 C3 G3 E3 G3 C3 G3 E3 G3 | G2 D3 B2 D3 G2 D3 B2 D3 | A2 E3 C3 E3 A2 E3 C3 E3 | F2 C3 A2 C3 F2 C3 A2 C3 | C3 G3 E3 G3 C3 G3 E3 G3 | G2 D3 B2 D3 G2 D3 B2 D3 | A2 E3 C3 E3 A2 E3 C3 E3 | F2 C3 A2 C3 F2 C3 A2 C3
```

### 16.2 Rock: driving eighths
- **Goal:** Drive a song with root and fifth.
- **Learn:** Rock's left hand is simple and strong: the root and fifth together, in steady eighth notes. Stay relaxed, since a tight wrist tires quickly. Bounce from the wrist, and let the right hand hit the backbeat on 2 and 4.
- **Drill:** The left-hand shapes, on the staff.
- **Notes:** F2 G2 A2 C3 D3 E3 G3 D4 E4 F4 G4 A4 B4 C5
- **Check:** chords bass C3+G3 A2+E3 F2+C3 G2+D3

```alphatex
\title "Eighth Note Engine" \tempo 84 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 r (E4 G4 C5) r (E4 G4 C5) | r (E4 A4 C5) r (E4 A4 C5) | r (F4 A4 C5) r (F4 A4 C5) | r (D4 G4 B4) r (D4 G4 B4)
\staff { score } \clef F4
:8 (C3 G3) (C3 G3) (C3 G3) (C3 G3) (C3 G3) (C3 G3) (C3 G3) (C3 G3) | (A2 E3) (A2 E3) (A2 E3) (A2 E3) (A2 E3) (A2 E3) (A2 E3) (A2 E3) | (F2 C3) (F2 C3) (F2 C3) (F2 C3) (F2 C3) (F2 C3) (F2 C3) (F2 C3) | (G2 D3) (G2 D3) (G2 D3) (G2 D3) (G2 D3) (G2 D3) (G2 D3) (G2 D3)
```

### 16.3 Soul: a walking pulse
- **Goal:** Lay back with a dotted bass line.
- **Learn:** Soul sits behind the beat and breathes. The left hand plays a long note, a short pickup, then walks up to the next chord. The right hand answers on 2 and 4 with a soft chord. Think warm and round, never hurried.
- **Drill:** Tap the left-hand rhythm.
- **Notes:** F2 G2 A2 B2 C3 D3 E3 G3 D4 E4 F4 G4 A4 B4 C5
- **Check:** tap 4 dq e q q | dq e h | q dq e q | dq e dq e | dq e q q

```alphatex
\title "Warm Walk" \tempo 76 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 r (E4 G4 C5) r (E4 G4 C5) | r (E4 A4 C5) r (E4 A4 C5) | r (F4 A4 C5) r (F4 A4 C5) | r (D4 G4 B4) r (D4 G4 B4)
\staff { score } \clef F4
C3.4{d} C3.8 E3.4 G3.4 | A2.4{d} A2.8 C3.4 E3.4 | F2.4{d} F2.8 A2.4 C3.4 | G2.4{d} G2.8 B2.4 D3.4
```

### 16.4 Funk: the one and the gaps
- **Goal:** Lock a syncopated line around beat 1.
- **Learn:** Funk puts its weight on beat 1, then plays with the spaces. The rests are as important as the notes, so lift the hand right on time. Short, dry notes work best, and sixteenth notes split each beat into four. This one is a Dorian vamp on D, ready for Jam's Funk band.
- **Drill:** Tap rhythms where the gaps matter.
- **Notes:** A2 B2 C3 D3 F3 G3 A3 F4 G4 A4 B4 C5 D5
- **Check:** tap 4 e er e e er e e er | q er e er e q | e er er e e er q | q e e er e e er | e er e e q er e

```alphatex
\title "Mind the Gaps" \tempo 72 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 r :8 (F4 A4 C5) r :4 r :8 (F4 A4 C5) r | :4 r :8 (F4 A4 C5) r :4 r :8 (G4 B4 D5) r | :4 r :8 (F4 A4 C5) r :4 r :8 (F4 A4 C5) r | :4 r :8 (G4 B4 D5) r :4 r :8 (F4 A4 C5) r
\staff { score } \clef F4
:8 D3 r :16 r D3 r D3 :8 F3 r G3 A3 | :8 D3 r :16 r D3 r D3 :8 C3 r B2 C3 | :8 D3 r :16 r D3 r D3 :8 F3 r G3 A3 | :8 D3 r :16 r D3 r D3 :8 A2 r B2 C3
```

## Unit 17: Grooves: blues, jazz, bossa nova

Three patterns with their own lilt. Keep the left hand steady, then try it with the band of the same name in Jam.

### 17.1 Blues: boogie bass
- **Goal:** Swing a boogie line in the left hand.
- **Learn:** Blues swings: each beat splits long-short. The score writes that in 12/8, four groups of three eighths, with a quarter and an eighth in each group. The classic boogie walks up the chord and back: C, E, G, A, B flat, A, G, E. It moves with the chord through the blues form.
- **Drill:** Short shapes from the boogie line.
- **Notes:** F2 G2 A2 B2 C3 D3 Eb3 E3 G3 A3 Bb3
- **Check:** shapes bass C3 E3 G3 A3 Bb3

```alphatex
\title "Boogie Walk" \tempo 108 \ts (12 8) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef F4
:4 C3 :8 C3 :4 E3 :8 E3 :4 G3 :8 G3 :4 A3 :8 A3 | :4 Bb3 :8 Bb3 :4 A3 :8 A3 :4 G3 :8 G3 :4 E3 :8 E3 | :4 F2 :8 F2 :4 A2 :8 A2 :4 C3 :8 C3 :4 D3 :8 D3 | :4 Eb3 :8 Eb3 :4 D3 :8 D3 :4 C3 :8 C3 :4 A2 :8 A2 | :4 C3 :8 C3 :4 E3 :8 E3 :4 G3 :8 G3 :4 A3 :8 A3 | :4 G2 :8 G2 :4 B2 :8 B2 :4 D3 :8 D3 :4 E3 :8 E3 | :4 F2 :8 F2 :4 A2 :8 A2 :4 C3 :8 C3 :4 D3 :8 D3 | :4 C3 :8 C3 :4 E3 :8 E3 :2 C3 r.4
```

### 17.2 Jazz: shells and comping
- **Goal:** Comp a ii V I with two-note shapes.
- **Learn:** Comping means accompanying with short chords. Shell shapes keep just the third and seventh, which tell the ear everything. Here the left hand plays a classic rhythm: a dotted quarter, then a short stab on the "and" of 2. Play it straight first. Jam's Jazz band will show you how it swings.
- **Drill:** The three shells on the staff.
- **Notes:** E3 F3 B3 C4 F4 G4 A4 B4 C5 D5 E5 F5
- **Check:** chords bass F3+C4 F3+B3 E3+B3
- **Tool:** chords

```alphatex
\title "Two Note Comping" \tempo 84 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
:4 D5 C5 A4 F4 | :4 G4 B4 D5 F5 | :1 E5 | :2 E5 r | :4 D5 C5 A4 F4 | :4 G4 B4 D5 F5 | :1 E5 | :2 E5 r
\staff { score } \clef F4
(F3 C4).4{d} (F3 C4).8 r.2 | (F3 B3).4{d} (F3 B3).8 r.2 | (E3 B3).4{d} (E3 B3).8 r.2 | :2 (E3 B3) r | (F3 C4).4{d} (F3 C4).8 r.2 | (F3 B3).4{d} (F3 B3).8 r.2 | (E3 B3).4{d} (E3 B3).8 r.2 | :2 (E3 B3) r
```

### 17.3 Bossa nova: bass and lilt
- **Goal:** Combine a steady bass with a gentle syncopation.
- **Learn:** Bossa nova is quiet and rocking. The left hand moves between root and fifth in a long-short pattern, like slow breathing. The right hand plays soft chords in groups of three, three and two eighths, across the bar. Keep the touch light: this is a groove for a small room.
- **Drill:** Tap each hand's rhythm.
- **Notes:** G2 A2 C3 D3 E3 G3 A3 D4 E4 F4 G4 A4 B4 C5
- **Check:** tap 4 dq e dq e | dq dq q | dq e dq e | dq dq q | q dq dq

```alphatex
\title "Quiet Sway" \tempo 76 \ts (4 4) \hideDynamics
\track "Piano" { instrument 0 } \staff { score } \clef G2
(E4 G4 B4).4{d} (E4 G4 B4).4{d} (E4 G4 B4).4 | (E4 G4 B4).4{d} (E4 G4 B4).4{d} (E4 G4 B4).4 | (D4 F4 A4).4{d} (D4 F4 A4).4{d} (D4 F4 A4).4 | (D4 F4 G4).4{d} (D4 F4 G4).4{d} (D4 F4 G4).4 | (E4 G4 B4).4{d} (E4 G4 B4).4{d} (E4 G4 B4).4 | (E4 A4 C5).4{d} (E4 A4 C5).4{d} (E4 A4 C5).4 | (D4 F4 A4).4{d} (D4 F4 A4).4{d} (D4 F4 G4).4 | :1 (E4 G4 B4)
\staff { score } \clef F4
C3.4{d} G3.8 G3.4{d} C3.8 | C3.4{d} G3.8 G3.4{d} C3.8 | D3.4{d} A3.8 A3.4{d} D3.8 | G2.4{d} D3.8 D3.4{d} G2.8 | C3.4{d} G3.8 G3.4{d} C3.8 | A2.4{d} E3.8 E3.4{d} A2.8 | D3.4{d} A3.8 G2.4{d} D3.8 | :1 C3
```

## Song shelf

Real pieces to play once a unit is done, in rough order of difficulty. They open like any song, with no scoring.

| After unit | Piece | Why here | File |
|---|---|---|---|
| 6 | Beyer, Kinderlied | Hands together at a gentle pace | beyer-kinderlied.musicxml |
| 6 | Beyer, Abendlied | A slow, singing line | beyer-abendlied.musicxml |
| 6 | Beyer, Op. 101 No. 66 | A longer study | beyer-op101-no66.musicxml |
| 7 | Türk, Aller Anfang ist schwer | Very short | turk-aller-anfang.musicxml |
| 7 | Türk, Bey der Wiege zu singen | Very short | turk-bey-der-wiege.musicxml |
| 7 | Türk, Der muntere Knabe | Very short | turk-muntere-knabe.musicxml |
| 7 | Türk, Hans ohne Sorgen | Very short | turk-hans-ohne-sorgen.musicxml |
| 7 | Türk, Ich bin so matt und krank | Very short | turk-matt-und-krank.musicxml |
| 8 | Petzold, Minuet in G | Finishes lesson 8.4, both hands | petzold-minuet-in-g.musicxml |
| 9 | Schumann, Melody, Op. 68 No. 1 | Expression marks that matter | schumann-melodie.musicxml |
| 9 | Schumann, Soldiers' March, Op. 68 No. 2 | Crisp rhythm | schumann-soldiers-march.musicxml |
| 10 | Burgmüller, La Candeur, Op. 100 No. 1 | Real speed and character | burgmuller-candeur.musicxml |
| 10 | Burgmüller, Arabesque, Op. 100 No. 2 | Fast, even fingers | burgmuller-arabesque.musicxml |
| 10 | Clementi, Sonatina Op. 36 No. 1, first movement | A first sonatina | clementi-op36-1.musicxml |
| 10 | Bach, Prelude in C, BWV 846 | Long-form chord reading | bach-prelude-in-c.musicxml |

## Writing lessons

- **Durations:** in alphaTex a duration stays in effect until the next one, including `.2` on a single note, so `C4.2 D4` makes D a half note too. That is why exercises restate `:4` after long notes.
- **Key signatures:** alphaTex doesn't apply them to the notes. With `\ks G`, a written `F4` plays F natural, so every sharp and flat is written out.
- **Dynamics:** alphaTab prints a default *f*, so exercises outside Unit 9 carry `\hideDynamics`.
- **Pieces:** files in `pieces/` are credited in `pieces/CREDITS.md`.

## Sources

Used as references. The wording here is original. Credits for the bundled pieces are in `pieces/CREDITS.md`.

| Source | License | Used for |
|---|---|---|
| [Reading Music: Common Notation](https://ufdcimages.uflib.ufl.edu/AA/00/01/16/39/00001/ReadingMusic.pdf), Schmidt-Jones | CC BY 3.0 | Notation topics |
| [Learning the Code](https://imslp.org/wiki/Learning_the_Code_(King,_James_L.)), King | CC BY-SA 4.0 | Piano method reference |
| [Open Music Theory](https://viva.pressbooks.pub/openmusictheory/) | CC BY-SA 4.0 | Later theory topics |
| [Vorschule im Klavierspiel, Op. 101](https://imslp.org/wiki/Vorschule_im_Klavierspiel%2C_Op.101_%28Beyer%2C_Ferdinand%29), Beyer | Public domain | Graded repertoire |

To add a piece, use a public-domain original. Don't copy a modern edition's fingerings or editorial marks, and don't use non-commercial material: Pliage is GPLv3, which allows selling copies.
