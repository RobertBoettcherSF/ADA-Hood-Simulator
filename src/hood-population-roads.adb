with Hood.Floats;
with Hood.Streets;

package body Hood.Population.Roads is

   --  The three capacity checks below raise; in the wasm build that reaches
   --  the last-chance handler, which reports the file and line to the page.
   pragma Warnings (Off, "pragma Restrictions (No_Exception_Propagation)");
   pragma Warnings (Off, "Last_Chance_Handler will be called");

   use Hood.Floats;
   package St renames Hood.Streets;

   Cell : constant Long_Float := St.Cell;

   function Len (AX, AY, BX, BY : Long_Float) return Long_Float is (Hypot (AX - BX, AY - BY));
   function Clamp (V, Lo, Hi : Long_Float) return Long_Float is (Max (Lo, Min (Hi, V)));
   function Side (V : Long_Float) return Long_Float is (if V < 0.0 then -1.0 else 1.0);
   --  Math.sign (v) || 1 (a zero, or -0, gives 1)
   function Side0 (V : Long_Float) return Long_Float renames Side;

   type Anchor is record
      AX, AY, BX, BY : Long_Float;  --  the street's two junctions
      CX, CY : Long_Float;          --  the nearest point on its line
      PX, PY : Long_Float;          --  the lane on that side
   end record;

   function Anchor_Of (X, Y : Long_Float) return Anchor is
      Best : Anchor;
      Found : Boolean := False;
      Distance : Long_Float := Infinity;
      J : Integer_32;
      R : Anchor;
      D : Long_Float;
   begin
      for I in 0 .. St.Node_Count - 1 loop
         for K in 0 .. St.Ways (I) - 1 loop
            J := St.Way (I, K);
            if J >= I then
               R.AX := St.Node_X (I);
               R.AY := St.Node_Y (I);
               R.BX := St.Node_X (J);
               R.BY := St.Node_Y (J);
               R.CX := Clamp (X, R.AX, R.BX);
               R.CY := Clamp (Y, R.AY, R.BY);
               if R.AY = R.BY then
                  R.PX := R.CX;
                  R.PY := R.CY + Side (Y - R.CY) * Lane_Offset;
               else
                  R.PX := R.CX + Side (X - R.CX) * Lane_Offset;
                  R.PY := R.CY;
               end if;
               D := Len (X, Y, R.PX, R.PY);
               if D < Distance then
                  Distance := D;
                  Best := R;
                  Found := True;
               end if;
            end if;
         end loop;
      end loop;
      if not Found then
         raise Program_Error;  --  the city has no driveable streets
      end if;
      return Best;
   end Anchor_Of;

   function On_Road (C : Hood.City.City_State; X, Y : Long_Float) return Boolean is
      Margin : constant Long_Float := Lane_Offset + 0.35;
      GX : constant Integer_32 := Floor_Int (X / Cell);
      GY : constant Integer_32 := Floor_Int (Y / Cell);
      NX : constant Integer_32 := Round_Int (X / Cell);
      NY : constant Integer_32 := Round_Int (Y / Cell);
   begin
      for XX in GX - 1 .. GX + 1 loop
         if abs (Y - Long_Float (NY) * Cell) <= Margin and then X >= Long_Float (XX) * Cell - Margin
           and then X <= Long_Float (XX + 1) * Cell + Margin and then St.Edge_Open (C, XX, NY, XX + 1, NY)
         then
            return True;
         end if;
      end loop;
      for YY in GY - 1 .. GY + 1 loop
         if abs (X - Long_Float (NX) * Cell) <= Margin and then Y >= Long_Float (YY) * Cell - Margin
           and then Y <= Long_Float (YY + 1) * Cell + Margin and then St.Edge_Open (C, NX, YY, NX, YY + 1)
         then
            return True;
         end if;
      end loop;
      return False;
   end On_Road;

   function Clear
     (X, Y : Long_Float; Taken_X, Taken_Y : Walk.Coord_List; Taken : Integer_32) return Boolean is
   begin
      for K in 0 .. Taken - 1 loop
         if Len (Taken_X (K), Taken_Y (K), X, Y) < 5.5 then
            return False;
         end if;
      end loop;
      return True;
   end Clear;

   procedure Parking_Spot
     (C : Hood.City.City_State; NX, NY : Long_Float;
      Taken_X, Taken_Y : Walk.Coord_List; Taken : Integer_32;
      X, Y : out Long_Float)
   is
      pragma Unreferenced (C);
      A : constant Anchor := Anchor_Of (NX, NY);
      Horizontal : constant Boolean := A.AY = A.BY;
      Lo : constant Long_Float :=
        Min ((if Horizontal then A.AX else A.AY), (if Horizontal then A.BX else A.BY)) + 8.0;
      Hi : constant Long_Float :=
        Max ((if Horizontal then A.AX else A.AY), (if Horizontal then A.BX else A.BY)) - 8.0;
      Offsets : constant array (1 .. 11) of Long_Float :=
        [0.0, 6.0, -6.0, 12.0, -12.0, 18.0, -18.0, 24.0, -24.0, 30.0, -30.0];
      Base : Long_Float;
      FX, FY, SX, SY, At_S : Long_Float := 0.0;
   begin
      if Lo > Hi then
         At_S := (Lo + Hi) / 2.0;
      else
         Base := Clamp ((if Horizontal then A.CX else A.CY), Lo, Hi);
         for K in Offsets'Range loop
            At_S := Clamp (Base + Offsets (K), Lo, Hi);
            if Horizontal then
               SX := At_S; SY := A.PY;
            else
               SX := A.PX; SY := At_S;
            end if;
            if K = 1 then
               FX := SX; FY := SY;
            end if;
            if Clear (SX, SY, Taken_X, Taken_Y, Taken) then
               X := SX; Y := SY;
               return;
            end if;
         end loop;
         X := FX; Y := FY;
         return;
      end if;
      if Horizontal then
         X := At_S; Y := A.PY;
      else
         X := A.PX; Y := At_S;
      end if;
   end Parking_Spot;

   procedure Pavement_Beside (C : Hood.City.City_State; X, Y : in out Long_Float) is
      pragma Unreferenced (C);
      A : constant Anchor := Anchor_Of (X, Y);
   begin
      if A.AY = A.BY then
         Y := A.CY + Side (Y - A.CY) * Kerb_Offset;
      else
         X := A.CX + Side (X - A.CX) * Kerb_Offset;
      end if;
   end Pavement_Beside;

   ---------------------------------------------------------------------
   --  turnRoute: the shortest way through the junctions, keeping on or
   --  turning right or left (never back but at a dead end, or anywhere
   --  with Reverse_All); among equals the fewest turns, right first.
   ---------------------------------------------------------------------

   HX : constant array (Integer_32 range 0 .. 3) of Integer_32 := [1, 0, -1, 0];
   HY : constant array (Integer_32 range 0 .. 3) of Integer_32 := [0, 1, 0, -1];
   Turn_Cost : constant array (Integer_32 range 0 .. 3) of Long_Float := [0.0, 0.01, 0.02, 0.0101];

   Max_States : constant := 4 * St.Max_Nodes;
   Max_Heap   : constant := 8 * Max_States;  --  proposed
   Cost : array (Integer_32 range 0 .. Max_States - 1) of Long_Float;
   Pred : array (Integer_32 range 0 .. Max_States - 1) of Integer_32;
   type Heap_Item is record
      C : Long_Float;
      S, N : Integer_32;
   end record;
   Heap : array (Integer_32 range 0 .. Max_Heap - 1) of Heap_Item;
   Heap_Len : Integer_32;
   Pushed : Integer_32;

   function Less (I, J : Integer_32) return Boolean is
     (Heap (I).C < Heap (J).C or else (Heap (I).C = Heap (J).C and then Heap (I).N < Heap (J).N));

   procedure Swap (I, J : Integer_32) is
      T : constant Heap_Item := Heap (I);
   begin
      Heap (I) := Heap (J);
      Heap (J) := T;
   end Swap;

   procedure Push (C : Long_Float; S : Integer_32) is
      I, Up : Integer_32;
   begin
      if Heap_Len >= Max_Heap then
         raise Program_Error;  --  car route heap full (Max_Heap)
      end if;
      Heap (Heap_Len) := (C, S, Pushed);
      Pushed := Pushed + 1;
      I := Heap_Len;
      Heap_Len := Heap_Len + 1;
      while I > 0 loop
         Up := (I - 1) / 2;
         exit when not Less (I, Up);
         Swap (I, Up);
         I := Up;
      end loop;
   end Push;

   procedure Pop (Top : out Heap_Item) is
      I, L, R, M : Integer_32;
   begin
      Top := Heap (0);
      Heap_Len := Heap_Len - 1;
      if Heap_Len > 0 then
         Heap (0) := Heap (Heap_Len);
         I := 0;
         loop
            L := 2 * I + 1;
            R := L + 1;
            M := I;
            if L < Heap_Len and then Less (L, M) then
               M := L;
            end if;
            if R < Heap_Len and then Less (R, M) then
               M := R;
            end if;
            exit when M = I;
            Swap (I, M);
            I := M;
         end loop;
      end if;
   end Pop;

   function Step_Of (Node, D : Integer_32) return Integer_32 is (Node + HY (D) * St.Width + HX (D));

   function Open (Node, D : Integer_32) return Boolean is
     (Step_Of (Node, D) in 0 .. St.Node_Count - 1 and then St.Opens (Node, Step_Of (Node, D)));

   Route_Nodes : array (Integer_32 range 0 .. Max_States - 1) of Integer_32;

   procedure Turn_Route
     (Start, Heading : Integer_32; Set_Off : Long_Float; End_A, End_B : Integer_32;
      BCX, BCY : Long_Float; Reverse_All : Boolean; Count : out Integer_32)
   is
      N4 : constant Integer_32 := St.Node_Count * 4;
      First : constant Integer_32 := Start * 4 + Heading;
      Best : Long_Float := Infinity;
      Arrival : Integer_32 := -1;
      Top : Heap_Item;
      Moves : array (1 .. 4) of Integer_32;
      NM : Integer;
      Node, D, T, Next, NS : Integer_32;
      Turn, Total, NC : Long_Float;
      Any : Boolean;
   begin
      for K in 0 .. N4 - 1 loop
         Cost (K) := Infinity;
         Pred (K) := -1;
      end loop;
      Heap_Len := 0;
      Pushed := 0;
      Cost (First) := Set_Off;
      Pred (First) := First;
      Push (Set_Off, First);
      while Heap_Len > 0 loop
         Pop (Top);
         if Top.C > Cost (Top.S) or else Top.C >= Best then
            exit when Top.C >= Best;
         else
            Node := Top.S / 4;
            D := Top.S mod 4;
            Moves (1) := D;
            Moves (2) := (D + 1) mod 4;
            Moves (3) := (D + 3) mod 4;
            NM := 3;
            Any := Open (Node, Moves (1)) or else Open (Node, Moves (2)) or else Open (Node, Moves (3));
            if Reverse_All or else not Any then
               NM := 4;
               Moves (4) := (D + 2) mod 4;
            end if;
            for M in 1 .. NM loop
               T := Moves (M);
               if Open (Node, T) then
                  Next := Step_Of (Node, T);
                  Turn := Turn_Cost ((T - D + 4) mod 4);
                  if (Node = End_A and then Next = End_B) or else (Node = End_B and then Next = End_A) then
                     Total := Top.C + Turn + Len (St.Node_X (Node), St.Node_Y (Node), BCX, BCY);
                     if Total < Best then
                        Best := Total;
                        Arrival := Top.S;
                     end if;
                  else
                     NS := Next * 4 + T;
                     NC := Top.C + Turn + Cell;
                     if NC < Cost (NS) then
                        Cost (NS) := NC;
                        Pred (NS) := Top.S;
                        Push (NC, NS);
                     end if;
                  end if;
               end if;
            end loop;
         end if;
      end loop;
      Count := 0;
      if Arrival < 0 then
         Count := -1;
         return;
      end if;
      declare
         S : Integer_32 := Arrival;
      begin
         loop
            if Count = 0 or else Route_Nodes (Count - 1) /= S / 4 then
               Route_Nodes (Count) := S / 4;
               Count := Count + 1;
            end if;
            exit when Pred (S) = S;
            S := Pred (S);
         end loop;
      end;
      for K in 0 .. Count / 2 - 1 loop
         declare
            V : constant Integer_32 := Route_Nodes (K);
         begin
            Route_Nodes (K) := Route_Nodes (Count - 1 - K);
            Route_Nodes (Count - 1 - K) := V;
         end;
      end loop;
   end Turn_Route;

   ---------------------------------------------------------------------
   --  vehicleRoute
   ---------------------------------------------------------------------

   Max_Centres : constant := Max_States + 4;
   Raw_X, Raw_Y, Cen_X, Cen_Y : array (Integer_32 range 0 .. Max_Centres - 1) of Long_Float;

   procedure Vehicle_Route
     (C : Hood.City.City_State; FX, FY, TX, TY : Long_Float; Zig : Boolean;
      Taken_X, Taken_Y : Walk.Coord_List; Taken : Integer_32;
      R : out Route_Rec)
   is
      A : constant Anchor := Anchor_Of (FX, FY);
      B : constant Anchor := Anchor_Of (TX, TY);
      W1 : constant Integer_32 := St.Width;
      function Id (X, Y : Long_Float) return Integer_32 is
        (Round_Int (Y / Cell) * W1 + Round_Int (X / Cell));
      Horizontal : constant Boolean := A.AY = A.BY;
      From_On : constant Boolean := On_Road (C, FX, FY);
      SX : constant Long_Float := (if From_On then FX else A.PX);
      SY : constant Long_Float := (if From_On then FY else A.PY);
      Heading : constant Integer_32 :=
        (if Horizontal then (if SY >= A.CY then 0 else 2) else (if SX <= A.CX then 1 else 3));
      Forward : constant Long_Float := (if Heading < 2 then 1.0 else -1.0);
      A_First : constant Boolean := (if Horizontal then A.AX < A.BX else A.AY < A.BY);
      LoX : constant Long_Float := (if A_First then A.AX else A.BX);
      LoY : constant Long_Float := (if A_First then A.AY else A.BY);
      HiX : constant Long_Float := (if A_First then A.BX else A.AX);
      HiY : constant Long_Float := (if A_First then A.BY else A.AY);
      AheadX : constant Long_Float := (if Forward > 0.0 then HiX else LoX);
      AheadY : constant Long_Float := (if Forward > 0.0 then HiY else LoY);
      Same_Street : constant Boolean :=
        Id (A.AX, A.AY) = Id (B.AX, B.AY) and then Id (A.BX, A.BY) = Id (B.BX, B.BY);
      NR, NC : Integer_32 := 0;
      N : Integer_32 := 0;

      procedure Raw (X, Y : Long_Float) is
      begin
         Raw_X (NR) := X;
         Raw_Y (NR) := Y;
         NR := NR + 1;
      end Raw;

      procedure Put (X, Y : Long_Float) is
      begin
         if N = 0 or else Len (X, Y, R.Path (N - 1).X, R.Path (N - 1).Y) > 1.0E-6 then
            if N >= Walk.Max_Path_Points then
               raise Program_Error;  --  car route longer than Max_Path_Points
            end if;
            R.Path (N) := (X => X, Y => Y, Cross => 0.0);
            N := N + 1;
         end if;
      end Put;

      procedure Lane (SX, SY, EX, EY : Long_Float; OX, OY : out Long_Float) is
      begin
         OX := -Sign (EY - SY) * Lane_Offset;
         OY := Sign (EX - SX) * Lane_Offset;
      end Lane;
   begin
      Raw (A.CX, A.CY);
      if Same_Street
        and then (if Horizontal then B.CX - A.CX else B.CY - A.CY) * Forward >= -0.5
      then
         null;
      else
         declare
            Count : Integer_32;
            Ahead : constant Integer_32 := Id (AheadX, AheadY);
            Set_Off : constant Long_Float := Len (A.CX, A.CY, AheadX, AheadY);
         begin
            Turn_Route (Ahead, Heading, Set_Off, Id (B.AX, B.AY), Id (B.BX, B.BY), B.CX, B.CY, False, Count);
            if Count < 0 then
               Turn_Route (Ahead, Heading, Set_Off, Id (B.AX, B.AY), Id (B.BX, B.BY), B.CX, B.CY, True, Count);
            end if;
            if Count >= 0 then
               for K in 0 .. Count - 1 loop
                  Raw (St.Node_X (Route_Nodes (K)), St.Node_Y (Route_Nodes (K)));
               end loop;
            else
               Raw (AheadX, AheadY);
               declare
                  Nodes : St.Node_List;
                  NN : Integer_32;
               begin
                  St.Route (AheadX, AheadY, B.AX, B.AY, Zig, Nodes, NN);
                  for K in 1 .. Integer (NN) loop
                     Raw (St.Node_X (Nodes (K)), St.Node_Y (Nodes (K)));
                  end loop;
               end;
            end if;
         end;
      end if;
      Raw (B.CX, B.CY);
      --  Each centre against the one before it in the unfiltered list.
      for K in 0 .. NR - 1 loop
         if K = 0 or else Len (Raw_X (K), Raw_Y (K), Raw_X (K - 1), Raw_Y (K - 1)) > 1.0E-6 then
            Cen_X (NC) := Raw_X (K);
            Cen_Y (NC) := Raw_Y (K);
            NC := NC + 1;
         end if;
      end loop;
      for I in 1 .. NC - 1 loop
         declare
            SX : constant Long_Float := Cen_X (I - 1);
            SY : constant Long_Float := Cen_Y (I - 1);
            EX : constant Long_Float := Cen_X (I);
            EY : constant Long_Float := Cen_Y (I);
            HOX, HOY, NOX, NOY : Long_Float;
         begin
            Lane (SX, SY, EX, EY, HOX, HOY);
            if I = 1 then
               Put (SX + HOX, SY + HOY);
            end if;
            if I + 1 < NC then
               Lane (EX, EY, Cen_X (I + 1), Cen_Y (I + 1), NOX, NOY);
               if (HOX = 0.0) /= (NOX = 0.0) then
                  if HOX = 0.0 then
                     Put (EX + NOX, EY + HOY);
                  else
                     Put (EX + HOX, EY + NOY);
                  end if;
               else
                  Put (EX + HOX, EY + HOY);
                  declare
                     FX : constant Long_Float := Sign (EX - SX);
                     FY : constant Long_Float := Sign (EY - SY);
                  begin
                     if FX * Sign (Cen_X (I + 1) - EX) < 0.0 or else FY * Sign (Cen_Y (I + 1) - EY) < 0.0 then
                        declare
                           BX : constant Long_Float := EX + FX * Lane_Offset * 1.2;
                           BY : constant Long_Float := EY + FY * Lane_Offset * 1.2;
                        begin
                           if On_Road (C, BX, BY) then
                              Put (BX, BY);
                           else
                              Put (EX, EY);
                           end if;
                        end;
                     end if;
                  end;
                  Put (EX + NOX, EY + NOY);
               end if;
            else
               Put (EX + HOX, EY + HOY);
            end if;
         end;
      end loop;
      --  Stop in its own lane by the destination.
      declare
         DX, DY : Long_Float;
      begin
         if N = 0 then
            DX := B.PX;
            DY := B.PY;
         else
            declare
               LX : constant Long_Float := R.Path (N - 1).X;
               LY : constant Long_Float := R.Path (N - 1).Y;
            begin
               if Len (LX, LY, B.PX, B.PY) <= Len (2.0 * B.CX - LX, 2.0 * B.CY - LY, B.PX, B.PY) then
                  DX := B.PX;
                  DY := B.PY;
               else
                  DX := LX;
                  DY := LY;
               end if;
            end;
         end if;
         if not Clear (DX, DY, Taken_X, Taken_Y, Taken) then
            declare
               Along : constant Boolean := B.AY = B.BY;
               BFX : constant Long_Float := (if N > 1 then R.Path (N - 2).X elsif N = 1 then R.Path (0).X else DX);
               BFY : constant Long_Float := (if N > 1 then R.Path (N - 2).Y elsif N = 1 then R.Path (0).Y else DY);
               Dir : constant Long_Float := Side0 (if Along then DX - BFX else DY - BFY);
               Lo : constant Long_Float :=
                 Min ((if Along then B.AX else B.AY), (if Along then B.BX else B.BY)) + 8.0;
               Hi : constant Long_Float :=
                 Max ((if Along then B.AX else B.AY), (if Along then B.BX else B.BY)) - 8.0;
               Back : constant Long_Float := (if Along then BFX else BFY);
               Offs : constant array (1 .. 6) of Long_Float := [6.0, 12.0, 18.0, -6.0, -12.0, -18.0];
               S, PX, PY : Long_Float;
            begin
               for K in Offs'Range loop
                  S := (if Along then DX else DY) + Offs (K) * Dir;
                  if not (S < Lo or else S > Hi or else (Offs (K) < 0.0 and then (S - Back) * Dir < 1.0)) then
                     if Along then
                        PX := S; PY := DY;
                     else
                        PX := DX; PY := S;
                     end if;
                     if Clear (PX, PY, Taken_X, Taken_Y, Taken) then
                        DX := PX;
                        DY := PY;
                        exit;
                     end if;
                  end if;
               end loop;
            end;
         end if;
         Put (DX, DY);
         R.Dest_X := DX;
         R.Dest_Y := DY;
      end;
      R.Count := N;
      if From_On then
         R.Start_X := FX;
         R.Start_Y := FY;
      elsif NC > 1 then
         R.Start_X := R.Path (0).X;
         R.Start_Y := R.Path (0).Y;
      else
         R.Start_X := A.PX;
         R.Start_Y := A.PY;
      end if;
   end Vehicle_Route;

end Hood.Population.Roads;
