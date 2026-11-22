--  Whole-number positions: 256 map units to one 1.2.91 unit (a metre).
--  Products and squares go through Integer_64; divisions round down (floor).
with Interfaces;

package Hood.Units with Pure is

   use Interfaces;

   Scale : constant := 256;  --  proposed (DESIGN 3.4)

   type Units is range -2**31 .. 2**31 - 1 with Size => 32;

   function Floor_Div (A, B : Integer_64) return Integer_64
     with Pre => B /= 0;
   --  A / B rounded down, also for negative values.

   function Whole (N : Integer_32) return Units
     with Pre => abs Integer_64 (N) <= 2**23 - 1;
   --  N whole 1.2.91 units.

   function Ratio (Num, Den : Integer_32) return Units
     with Pre => Den /= 0 and then abs Integer_64 (Num) <= 2**23 - 1;
   --  Num / Den 1.2.91 units, rounded down to 1/256.

   function Isqrt (N : Unsigned_64) return Unsigned_64
     with Pre  => N <= 2**62,
          Post => Isqrt'Result * Isqrt'Result <= N
                  and then (Isqrt'Result + 1) * (Isqrt'Result + 1) > N;
   --  Square root rounded down.

   Max_Delta : constant := 2**30;

   function Distance (Dx, Dy : Units) return Units
     with Pre => abs Integer_64 (Dx) <= Max_Delta
                 and then abs Integer_64 (Dy) <= Max_Delta;
   --  sqrt (Dx**2 + Dy**2) rounded down (1.2.91 uses Math.hypot).

end Hood.Units;
