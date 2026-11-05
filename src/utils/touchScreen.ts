// A finger-first screen (the Android tablet or phone): the one switch for
// touch layout. CSS asks the same thing with @media (pointer: coarse).
export const touchScreen = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
