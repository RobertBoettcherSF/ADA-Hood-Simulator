package body Hood.Random is

   procedure Next (G : in out Mulberry; Value : out Unsigned_32) is
      T : Unsigned_32;
   begin
      G.S := G.S + 16#6D2B_79F5#;
      T := G.S;
      T := (T xor Shift_Right (T, 15)) * (T or 1);
      T := T xor (T + (T xor Shift_Right (T, 7)) * (T or 61));
      Value := T xor Shift_Right (T, 14);
   end Next;

   --  floor (U / 2**32 * Span), exact in integers.
   function Scale (U : Unsigned_32; Span : Unsigned_64) return Unsigned_64 is
     (Shift_Right (Unsigned_64 (U) * Span, 32));

   procedure Int
     (G : in out Mulberry; Min, Max : Integer_32; Value : out Integer_32)
   is
      U : Unsigned_32;
   begin
      if Max < Min then
         Value := Min;
      else
         Next (G, U);
         Value := Integer_32
           (Integer_64 (Min)
            + Integer_64 (Scale (U, Unsigned_64 (Integer_64 (Max) - Integer_64 (Min) + 1))));
      end if;
   end Int;

   procedure Pick_Index
     (G : in out Mulberry; Length : Integer_32; Index : out Integer_32)
   is
      U : Unsigned_32;
   begin
      Next (G, U);
      Index := Integer_32 (Scale (U, Unsigned_64 (Length)));
   end Pick_Index;

   procedure Chance
     (G : in out Mulberry; Num, Den : Unsigned_32; Result : out Boolean)
   is
      U : Unsigned_32;
   begin
      Next (G, U);
      --  U / 2**32 < Num / Den
      Result := Unsigned_64 (U) * Unsigned_64 (Den)
                < Shift_Left (Unsigned_64 (Num), 32);
   end Chance;

   procedure Weighted
     (G : in out Mulberry; Weights : Weight_List; Index : out Positive)
   is
      Total : Integer_64 := 0;
      Sum   : Integer_64 := 0;
      U     : Unsigned_32;
      Roll  : Unsigned_64;
   begin
      for W of Weights loop
         if W > 0 then
            Total := Total + Integer_64 (W);
         end if;
      end loop;
      Index := Weights'First;
      if Total <= 0 then
         return;
      end if;
      Next (G, U);
      --  roll = U / 2**32 * Total; the first positive weight whose running
      --  sum reaches roll wins (rng.ts:56-62), scaled by 2**32.
      Roll := Unsigned_64 (U) * Unsigned_64 (Total);
      Index := Weights'Last;
      for I in Weights'Range loop
         if Weights (I) > 0 then
            Sum := Sum + Integer_64 (Weights (I));
            if Roll <= Shift_Left (Unsigned_64 (Sum), 32) then
               Index := I;
               return;
            end if;
         end if;
      end loop;
   end Weighted;

   procedure Shuffle (G : in out Mulberry; Items : in out Index_List) is
      U    : Unsigned_32;
      J    : Positive;
      Swap : Integer_32;
   begin
      for I in reverse Items'First + 1 .. Items'Last loop
         Next (G, U);
         J := Items'First
              + Natural (Scale (U, Unsigned_64 (I - Items'First + 1)));
         Swap := Items (I);
         Items (I) := Items (J);
         Items (J) := Swap;
      end loop;
   end Shuffle;

   procedure Plan_Next (G : in out Plan_Lcg; Value : out Plan_Value) is
   begin
      G.S := G.S * 214_013 + 2_531_011;
      Value := Plan_Value (Shift_Right (G.S, 16) and 16#7FFF#);
   end Plan_Next;

   function Hash32 (N : Unsigned_32) return Unsigned_32 is
      X : Unsigned_32 := N;
   begin
      X := (X xor Shift_Right (X, 16)) * 16#7FEB_352D#;
      X := (X xor Shift_Right (X, 15)) * 16#846C_A68B#;
      return X xor Shift_Right (X, 16);
   end Hash32;

end Hood.Random;
