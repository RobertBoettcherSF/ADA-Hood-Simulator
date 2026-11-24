--  Item 6: movement in IEEE doubles (Long_Float), computed in the same
--  order as 1.2.91's JavaScript so positions come out bit for bit the
--  same. Only movement uses them (people, cars, routes); money, skills,
--  loyalty and time stay whole numbers (DESIGN 3.4). Builds use
--  -ffp-contract=off, so no multiply-add is fused.
with Interfaces;

package Hood.Floats with Pure is

   use Interfaces;

   function Sqrt (X : Long_Float) return Long_Float;
   pragma Import (Intrinsic, Sqrt, "__builtin_sqrt");
   --  Correctly rounded: f64.sqrt in WebAssembly, sqrtsd natively.

   function Hypot (A, B : Long_Float) return Long_Float;
   --  Math.hypot as V8 computes it (scaled by the larger value, Kahan
   --  summation, then the root): checked against Node 24 on 6 million
   --  pairs.

   function Floor (V : Long_Float) return Long_Float;
   function Ceil (V : Long_Float) return Long_Float;
   function Round (V : Long_Float) return Long_Float;
   --  Math.round: the nearest whole number, halves upward.
   function Floor_Int (V : Long_Float) return Integer_32;
   function Round_Int (V : Long_Float) return Integer_32;
   function Sign (V : Long_Float) return Long_Float is
     (if V > 0.0 then 1.0 elsif V < 0.0 then -1.0 else 0.0);
   function Min (A, B : Long_Float) return Long_Float is (if A < B then A else B);
   function Max (A, B : Long_Float) return Long_Float is (if A > B then A else B);

   function Bits (V : Long_Float) return Unsigned_64;
   --  The 64 bits of V, for hashes.

   function Units_Of (V : Long_Float) return Integer_32;
   --  V metres in 1/256, rounded down (the exported positions).

   Infinity : constant Long_Float := Long_Float'Last;
   --  Stands for JavaScript's Infinity in comparisons (proposed).

end Hood.Floats;
