with Ada.Unchecked_Conversion;

package body Hood.Floats is

   function Hypot (A, B : Long_Float) return Long_Float is
      X : constant Long_Float := abs A;
      Y : constant Long_Float := abs B;
      M : constant Long_Float := (if Y > X then Y else X);
      Sum, Comp, N, Summand, Pre : Long_Float;
   begin
      if M = 0.0 then
         return 0.0;
      end if;
      Sum := 0.0;
      Comp := 0.0;
      N := X / M;
      Summand := N * N - Comp;
      Pre := Sum + Summand;
      Comp := (Pre - Sum) - Summand;
      Sum := Pre;
      N := Y / M;
      Summand := N * N - Comp;
      Pre := Sum + Summand;
      Sum := Pre;
      return Sqrt (Sum) * M;
   end Hypot;

   --  Long_Float'Floor would call a runtime routine the WebAssembly build
   --  lacks: convert (to nearest), then step.
   function Floor (V : Long_Float) return Long_Float is
      I : Integer_64;
   begin
      if abs V >= 4.0E15 then
         return V;
      end if;
      I := Integer_64 (V);
      if Long_Float (I) > V then
         I := I - 1;
      end if;
      return Long_Float (I);
   end Floor;

   function Ceil (V : Long_Float) return Long_Float is (-Floor (-V));

   function Round (V : Long_Float) return Long_Float is
      F : constant Long_Float := Floor (V);
   begin
      return (if V - F >= 0.5 then F + 1.0 else F);
   end Round;

   function Floor_Int (V : Long_Float) return Integer_32 is (Integer_32 (Floor (V)));
   function Round_Int (V : Long_Float) return Integer_32 is (Integer_32 (Round (V)));

   function To_Bits is new Ada.Unchecked_Conversion (Long_Float, Unsigned_64);
   function Bits (V : Long_Float) return Unsigned_64 is (To_Bits (V));

   function Units_Of (V : Long_Float) return Integer_32 is (Integer_32 (Floor (V * 256.0)));

end Hood.Floats;
