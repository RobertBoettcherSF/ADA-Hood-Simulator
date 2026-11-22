package body Hood.Units is

   function Floor_Div (A, B : Integer_64) return Integer_64 is
     (if A rem B /= 0 and then (A < 0) /= (B < 0) then A / B - 1 else A / B);

   function Whole (N : Integer_32) return Units is (Units (N * Scale));

   function Ratio (Num, Den : Integer_32) return Units is
     (Units (Floor_Div (Integer_64 (Num) * Scale, Integer_64 (Den))));

   function Isqrt (N : Unsigned_64) return Unsigned_64 is
      Rest : Unsigned_64 := N;
      Root : Unsigned_64 := 0;
      Bit  : Unsigned_64 := 2**62;
   begin
      while Bit > N loop
         Bit := Shift_Right (Bit, 2);
      end loop;
      while Bit /= 0 loop
         if Rest >= Root + Bit then
            Rest := Rest - (Root + Bit);
            Root := Shift_Right (Root, 1) + Bit;
         else
            Root := Shift_Right (Root, 1);
         end if;
         Bit := Shift_Right (Bit, 2);
      end loop;
      return Root;
   end Isqrt;

   function Distance (Dx, Dy : Units) return Units is
     (Units (Isqrt (Unsigned_64 (Integer_64 (Dx) * Integer_64 (Dx)
                                 + Integer_64 (Dy) * Integer_64 (Dy)))));

end Hood.Units;
