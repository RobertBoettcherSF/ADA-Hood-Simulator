with Hood.Trig_Table;

package body Hood.Trig is

   subtype Quarter_Index is Integer range 0 .. Quarter_Turn;

   function Q (I : Quarter_Index) return Integer_64 is
     (Integer_64 (Hood.Trig_Table.Quarter (I)));

   function Sin (A : Angle) return Integer_32 is
      I : constant Quarter_Index := Integer (A mod Quarter_Turn);
   begin
      case A / Quarter_Turn is
         when 0      => return Integer_32 (Q (I));
         when 1      => return Integer_32 (Q (Quarter_Turn - I));
         when 2      => return Integer_32 (-Q (I));
         when others => return Integer_32 (-Q (Quarter_Turn - I));
      end case;
   end Sin;

   --  The largest K in 0 .. 1/8 turn with tan (K) <= Small / Large,
   --  found by bisection: Large * sin (K) <= Small * cos (K).
   function Octant_Angle (Small, Large : Integer_64) return Quarter_Index
     with Pre => Large > 0 and then Small in 0 .. Large
                 and then Large <= 2**31
   is
      Low  : Quarter_Index := 0;
      High : Quarter_Index := Eighth_Turn;
      Mid  : Quarter_Index;
   begin
      while Low < High loop
         Mid := (Low + High + 1) / 2;
         if Large * Q (Mid) <= Small * Q (Quarter_Turn - Mid) then
            Low := Mid;
         else
            High := Mid - 1;
         end if;
      end loop;
      return Low;
   end Octant_Angle;

   function Atan2 (Y, X : Hood.Units.Units) return Angle is
      use type Hood.Units.Units;
      AX : constant Integer_64 := abs Integer_64 (X);
      AY : constant Integer_64 := abs Integer_64 (Y);
      A  : Angle;
   begin
      if AX = 0 and then AY = 0 then
         return 0;
      elsif AY <= AX then
         A := Angle (Octant_Angle (AY, AX));
      else
         A := Angle (Quarter_Turn - Octant_Angle (AX, AY));
      end if;
      if X < 0 then
         A := Half_Turn - A;
      end if;
      if Y < 0 then
         A := -A;
      end if;
      return A;
   end Atan2;

end Hood.Trig;
