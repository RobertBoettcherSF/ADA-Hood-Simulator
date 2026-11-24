with Hood.Floats;
with Hood.Streets;

package body Hood.Trams is

   use Hood.Floats;

   Cell  : constant Long_Float := 54.0;
   Fine  : constant Long_Float := Cell / 5.0;
   Speed : constant Long_Float := 23.0 * 0.15 / (10.0 / 3.0);  --  1.035 m a minute
   Starts : constant array (1 .. 4) of Long_Float := [0.1, 0.3, 0.5, 0.7];

   --  JavaScript's a % b for b > 0, exactly: subtract the largest
   --  B * 2**K not above the rest until the rest is below B. Each
   --  subtraction is exact (the two values are within a factor of two),
   --  so no rounding happens and no runtime routine is needed.
   function Fmod (A, B : Long_Float) return Long_Float is
      R : Long_Float := abs A;
      D : Long_Float;
   begin
      while R >= B loop
         D := B;
         while D * 2.0 <= R loop
            D := D * 2.0;
         end loop;
         R := R - D;
      end loop;
      return (if A < 0.0 then -R else R);
   end Fmod;

   Dwell : constant Long_Float := 12.0;  --  TRAM_STOP_DWELL, minutes at a stop
   Max_Points : constant := 160;
   type Coords is array (Integer_32 range 0 .. Max_Points - 1) of Long_Float;

   procedure At_Time
     (C : Hood.City.City_State; Week : Integer_32; Minute : Long_Float;
      List : out Tram_List; Count : out Integer_32)
   is
      T : constant Long_Float := Long_Float (Integer_32'Max (0, Week - 1)) * 2400.0 + Minute;
      Line_No : Integer_32 := 0;

      --  One line through N points; every third inner point is a stop
      --  when With_Stops (the Large city's two routes).
      procedure One_Line (PX, PY : Coords; N : Integer_32; With_Stops : Boolean) is
         Cum : Coords := [others => 0.0];
         Stops : Coords := [others => 0.0];
         NS : Integer_32 := 0;
         Len, Overrun, Leg, Loop_Len, Period : Long_Float;

         procedure Point_At (S : Long_Float; X, Y : out Long_Float) is
            I : Integer_32 := 1;
            Span, F : Long_Float;
         begin
            while I < N - 1 and then Cum (I) < S loop
               I := I + 1;
            end loop;
            Span := Cum (I) - Cum (I - 1);
            if Span = 0.0 then
               Span := 1.0;
            end if;
            F := (S - Cum (I - 1)) / Span;
            X := PX (I - 1) + (PX (I) - PX (I - 1)) * F;
            Y := PY (I - 1) + (PY (I) - PY (I - 1)) * F;
         end Point_At;

         function Time_Of (U : Long_Float) return Long_Float is
            K : Integer_32 := 0;
         begin
            for J in 0 .. NS - 1 loop
               if Stops (J) < U then
                  K := K + 1;
               end if;
            end loop;
            return U / Speed + Long_Float (K) * Dwell;
         end Time_Of;

         procedure Loop_At (Tau0 : Long_Float; U : out Long_Float) is
            Tau : Long_Float := Tau0;
            Run : Long_Float;
         begin
            U := 0.0;
            for J in 0 .. NS - 1 loop
               Run := (Stops (J) - U) / Speed;
               if Tau < Run then
                  U := U + Tau * Speed;
                  return;
               end if;
               Tau := Tau - Run;
               if Tau < Dwell then
                  U := Stops (J);
                  return;
               end if;
               Tau := Tau - Dwell;
               U := Stops (J);
            end loop;
            U := Min (Loop_Len, U + Tau * Speed);
         end Loop_At;

         Phase, Tau, U, Along, Sgn, AX, AY, BX, BY, CX, CY, D, DX, DY : Long_Float;
      begin
         if N < 2 then
            return;
         end if;
         for I in 1 .. N - 1 loop
            Cum (I) := Cum (I - 1) + Hypot (PX (I) - PX (I - 1), PY (I) - PY (I - 1));
         end loop;
         Len := Cum (N - 1);
         if Len <= 0.0 then
            return;
         end if;
         Overrun := Fine / 2.0;
         Leg := Len + 2.0 * Overrun;
         Loop_Len := 2.0 * Leg;
         if With_Stops then
            for I in 1 .. N - 2 loop
               if I mod 3 = 1 then
                  Stops (NS) := Overrun + Cum (I);
                  NS := NS + 1;
               end if;
            end loop;
            declare
               Half : constant Integer_32 := NS;
            begin
               for J in 0 .. Half - 1 loop
                  Stops (NS) := Leg + Overrun + Len - (Stops (J) - Overrun);
                  NS := NS + 1;
               end loop;
            end;
            --  ascending
            for I in 1 .. NS - 1 loop
               declare
                  V : constant Long_Float := Stops (I);
                  J : Integer_32 := I - 1;
               begin
                  while J >= 0 and then Stops (J) > V loop
                     Stops (J + 1) := Stops (J);
                     J := J - 1;
                  end loop;
                  Stops (J + 1) := V;
               end;
            end loop;
         end if;
         Period := Loop_Len / Speed + Long_Float (NS) * Dwell;
         for K in 0 .. Per_Line - 1 loop
            declare
               P : constant Long_Float := Starts (Integer (K mod 4) + 1) * Len + Fine / 2.0;
            begin
               Phase := (if K < 4 then Time_Of (Overrun + P) else Time_Of (Leg + Overrun + Len - P));
            end;
            Tau := Fmod (Fmod (Phase + T, Period) + Period, Period);
            Loop_At (Tau, U);
            if U < Leg then
               Along := U - Overrun;
               Sgn := 1.0;
            else
               Along := Len + Overrun - (U - Leg);
               Sgn := -1.0;
            end if;
            Point_At (Along - 3.0 * Sgn, AX, AY);
            Point_At (Along + 3.0 * Sgn, BX, BY);
            D := Hypot (BX - AX, BY - AY);
            if D = 0.0 then
               D := 1.0;
            end if;
            DX := (BX - AX) / D;
            DY := (BY - AY) / D;
            Point_At (Along, CX, CY);
            List (Count) := (X => CX - DY * Track, Y => CY + DX * Track, DX => DX, DY => DY,
                             Line => Line_No,
                             Visible => Along >= Length / 2.0 and then Along <= Len - Length / 2.0);
            Count := Count + 1;
         end loop;
         Line_No := Line_No + 1;
      end One_Line;

      XS, YS : Coords := [others => 0.0];
   begin
      Count := 0;
      List := [others => (0.0, 0.0, 0.0, 0.0, 0, False)];
      if C.Standard then
         for R of C.Avenue_Rows loop
            if R >= 0 then
               XS (0) := 0.0;
               YS (0) := (Long_Float (R) + 0.5) * Cell;
               XS (1) := Long_Float (C.W) * Cell;
               YS (1) := YS (0);
               One_Line (XS, YS, 2, False);
            end if;
         end loop;
         for Col of C.Avenue_Cols loop
            if Col >= 0 then
               XS (0) := (Long_Float (Col) + 0.5) * Cell;
               YS (0) := 0.0;
               XS (1) := XS (0);
               YS (1) := Long_Float (C.H) * Cell;
               One_Line (XS, YS, 2, False);
            end if;
         end loop;
      else
         --  Crosstown, then the Civic Line (the street routes of the city).
         declare
            MX : constant Long_Float := Long_Float (C.W / 2);
            MY : constant Long_Float := Long_Float (C.H / 2);
            Nodes : Hood.Streets.Node_List;
            NN : Integer_32;
         begin
            for L in 1 .. 2 loop
               if L = 1 then
                  Hood.Streets.Route (0.0, MY * Cell, Long_Float (C.W) * Cell, (MY + 2.0) * Cell, False, Nodes, NN);
               else
                  Hood.Streets.Route ((MX - 2.0) * Cell, 0.0, (MX + 1.0) * Cell, Long_Float (C.H) * Cell, True, Nodes, NN);
               end if;
               for K in 1 .. Integer (NN) loop
                  XS (Integer_32 (K - 1)) := Hood.Streets.Node_X (Nodes (K));
                  YS (Integer_32 (K - 1)) := Hood.Streets.Node_Y (Nodes (K));
               end loop;
               One_Line (XS, YS, NN, True);
            end loop;
         end;
      end if;
   end At_Time;

end Hood.Trams;
