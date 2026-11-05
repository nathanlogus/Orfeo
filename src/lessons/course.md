# Orfeo Lessons

The course behind the Learn tab: reading piano music from a first note to sight-reading. Piano and keyboard only.

The explanations and numbered exercises are original to Orfeo. Songs are traditional or long out of copyright, arranged here from scratch. Sources and rules for adding pieces are in [Sources](#sources).

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
- Units unlock in order. Anyone can skip ahead by passing a unit's last lesson.
- Before Unit 4, students play note lengths by ear from Hear; Unit 4 then names them.

Notes use scientific pitch: Middle C is C4. Exercises are alphaTex, which alphaTab reads directly.

The app reads this file: `course.ts` parses each lesson, and `courseTest.ts` checks every exercise. **Check** sets a lesson's drill and **Mode** changes its steps: `no-hear` skips Hear, `sight` skips Hear and the wait-for-notes play, and `hide-bar` hides the bar being played.

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

To add a piece, use a public-domain original. Don't copy a modern edition's fingerings or editorial marks, and don't use non-commercial material: Orfeo is GPLv3, which allows selling copies.
