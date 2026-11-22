--  The world record. Step 2 holds the seeds, the size, the random-number
--  states, the clock and the grid; later items add people, crews and the rest.
with Interfaces;
with Hood.Grid;
with Hood.Random;

package Hood.World with Preelaborate is

   use Interfaces;

   type World_State is record
      City_Seed : Unsigned_32;
      Auto_Seed : Unsigned_32;
      Blocks_X  : Integer_32;
      Blocks_Y  : Integer_32;
      Main      : Hood.Random.Mulberry;  --  the simulation stream
      Plan      : Hood.Random.Plan_Lcg;  --  the city-plan stream
      Week      : Integer_32;
      Minute    : Integer_32;
      Cells     : Hood.Grid.Matrix;
   end record;

   procedure New_Game
     (W                    : out World_State;
      City_Seed, Auto_Seed : Unsigned_32;
      Blocks_X, Blocks_Y   : Integer_32)
     with Pre => Blocks_X in Hood.Grid.Min_Blocks .. Hood.Grid.Max_Blocks_X
                 and then Blocks_Y in Hood.Grid.Min_Blocks .. Hood.Grid.Max_Blocks_Y;
   --  Week 1, minute 0; both streams seeded from the city seed (the
   --  simulation stream as citygen.ts:362, the plan stream with retry 0).

   function Hash (W : World_State) return Unsigned_32;
   --  FNV-1a (32 bit) over the fields in this order (proposed), each as
   --  four little-endian bytes: city seed, Auto seed, blocks across, blocks
   --  down, simulation stream state, plan stream state, week, minute, then
   --  every cell inside the city row by row (y outer, x inner): kind
   --  ('Pos), block id.

end Hood.World;
