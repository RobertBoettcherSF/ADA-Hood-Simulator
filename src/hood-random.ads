--  Random numbers, bit-identical with the TypeScript build 1.2.91:
--  mulberry32 (src/sim/rng.ts:6-29), the city-plan generator's 15-bit LCG,
--  hash32 (src/sim/hash.ts:8-13) and the seed formulas of every stream.
--  Everything is integer arithmetic modulo 2**32, as in the TypeScript code.
with Interfaces;

package Hood.Random with Pure is

   use Interfaces;

   ----------------------------------------------------------------------
   --  mulberry32
   ----------------------------------------------------------------------

   Zero_Seed_Substitute : constant Unsigned_32 := 16#9E37_79B9#;
   --  A zero seed or state is replaced by this value (rng.ts:11, :19).

   type Mulberry is record
      S : Unsigned_32 := Zero_Seed_Substitute;
   end record;

   function Seeded (Seed : Unsigned_32) return Mulberry is
     (S => (if Seed = 0 then Zero_Seed_Substitute else Seed));

   function State (G : Mulberry) return Unsigned_32 is (G.S);

   procedure Next (G : in out Mulberry; Value : out Unsigned_32);
   --  rng.ts:23-28 without the final division by 2**32.

   Max_Span : constant := 2**21;
   --  Up to this many outcomes the TypeScript floating-point formulas are
   --  exact, so the integer versions below give the same results.

   procedure Int
     (G : in out Mulberry; Min, Max : Integer_32; Value : out Integer_32)
     with Pre  => Integer_64 (Max) - Integer_64 (Min) < Max_Span,
          Post => Value in Min .. Integer_32'Max (Min, Max);
   --  rng.ts:37-40: Min when Max < Min (no draw), else Min .. Max.

   procedure Pick_Index
     (G : in out Mulberry; Length : Integer_32; Index : out Integer_32)
     with Pre  => Length in 1 .. Max_Span,
          Post => Index in 0 .. Length - 1;
   --  rng.ts:47-49: a 0-based index into an array of Length items.

   procedure Chance
     (G : in out Mulberry; Num, Den : Unsigned_32; Result : out Boolean)
     with Pre => Den > 0 and then Num <= Den;
   --  rng.ts:43-45 with p = Num / Den. Same result as the TypeScript
   --  next() < p unless Num * 2**32 / Den lies within about 2**-21 of a
   --  whole number; each ported probability is checked for that.

   Max_Weights : constant := 1_024;
   Max_Weight  : constant := 2_048;
   --  Keep the total below Max_Span (proposed limits).

   type Weight_List is array (Positive range <>) of Integer_32;

   procedure Weighted
     (G : in out Mulberry; Weights : Weight_List; Index : out Positive)
     with Pre  => Weights'Length in 1 .. Max_Weights
                  and then (for all W of Weights => W < Max_Weight),
          Post => Index in Weights'Range;
   --  rng.ts:52-63: non-positive weights are skipped; no draw and the
   --  first item when no weight is positive.

   type Index_List is array (Positive range <>) of Integer_32;

   procedure Shuffle (G : in out Mulberry; Items : in out Index_List)
     with Pre => Items'Length < Max_Span;
   --  rng.ts:66-74: in-place Fisher-Yates from the last item down.

   ----------------------------------------------------------------------
   --  City-plan generator: LCG s := s * 214013 + 2531011, 15-bit output
   ----------------------------------------------------------------------

   type Plan_Lcg is record
      S : Unsigned_32 := 0;
   end record;

   function Plan_Seeded (Seed : Unsigned_32) return Plan_Lcg is (S => Seed);

   function Plan_State (G : Plan_Lcg) return Unsigned_32 is (G.S);

   subtype Plan_Value is Integer_32 range 0 .. 32_767;

   procedure Plan_Next (G : in out Plan_Lcg; Value : out Plan_Value);

   ----------------------------------------------------------------------
   --  hash32 (hash.ts:8-13)
   ----------------------------------------------------------------------

   function Hash32 (N : Unsigned_32) return Unsigned_32;

   ----------------------------------------------------------------------
   --  Stream seeds (all modulo 2**32, as the TypeScript >>> 0)
   ----------------------------------------------------------------------

   function City_Plan_Seed (City_Seed : Unsigned_32; Retry : Unsigned_32)
     return Unsigned_32 is (City_Seed + Retry);
   --  The city plan is re-tried with the next seed when it gets stuck.

   function Headquarters_Seed (City_Seed : Unsigned_32) return Unsigned_32 is
     (City_Seed xor 16#5EED_0400#);
   --  Headquarters placement uses its own city-plan LCG.

   function Rival_Week_Seed
     (City_Seed : Unsigned_32; Week, Gang_Id : Unsigned_32)
     return Unsigned_32 is (City_Seed + Week * 997 + Gang_Id * 13);
   --  rivalPlaybook.ts:38 (gang id numbering: item 9).

   function Auto_Week_Seed (Auto_Seed : Unsigned_32; Week : Unsigned_32)
     return Unsigned_32 is (Auto_Seed + Week * 997);
   --  autoTest.ts:1178.

   function Strategy_Seed (Auto_Seed : Unsigned_32; Runs : Unsigned_32)
     return Unsigned_32 is (Auto_Seed + Runs * 9973);
   --  strategy.ts:205.

   function Explore_Seed (Auto_Seed : Unsigned_32; Week : Unsigned_32)
     return Unsigned_32 is ((Auto_Seed xor 16#5EED#) + Week * 7919);
   --  autoLearn.ts:47-48.

end Hood.Random;
