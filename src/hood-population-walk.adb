with Hood.Population.Transport;
with Hood.Floats;
with Hood.Random;
with Hood.Streets;
with Hood.Population.Traffic;

package body Hood.Population.Walk is

   use Hood.Floats;

   Cell : constant Long_Float := Hood.Streets.Cell;

   ---------------------------------------------------------------------
   --  The pool of route chunks
   ---------------------------------------------------------------------

   type Chunk is array (Integer_32 range 0 .. Chunk_Points - 1) of Point;
   Chunks    : array (Integer_32 range 0 .. Max_Chunks - 1) of Chunk;
   Next_Of   : array (Integer_32 range 0 .. Max_Chunks - 1) of Integer_32;
   Free_Head : Integer_32 := No_Id;
   Used_Top  : Integer_32 := 0;   --  chunks above this were never handed out
   Full      : Boolean := False;

   procedure Reset is
   begin
      Free_Head := No_Id;
      Used_Top := 0;
      Full := False;
   end Reset;

   function Pool_Full return Boolean is (Full);

   function Take return Integer_32 is
      K : Integer_32;
   begin
      if Free_Head /= No_Id then
         K := Free_Head;
         Free_Head := Next_Of (K);
      elsif Used_Top < Max_Chunks then
         K := Used_Top;
         Used_Top := Used_Top + 1;
      else
         Full := True;
         return No_Id;
      end if;
      Next_Of (K) := No_Id;
      return K;
   end Take;

   procedure Give (K : Integer_32) is
   begin
      Next_Of (K) := Free_Head;
      Free_Head := K;
   end Give;

   procedure Free_Route (S : in out Population_State; I : Integer_32) is
      P : Person_Rec renames S.People (I);
      K, N : Integer_32;
   begin
      K := P.Path_Head;
      while K /= No_Id loop
         N := Next_Of (K);
         Give (K);
         K := N;
      end loop;
      P.Path_Head := No_Id;
      P.Path_Off := 0;
      P.Path_Len := 0;
   end Free_Route;

   function Point_Of (S : Population_State; I : Integer_32; K : Integer_32) return Point is
      P : Person_Rec renames S.People (I);
      At_K : Integer_32 := P.Path_Off + K;
      Ch : Integer_32 := P.Path_Head;
   begin
      while At_K >= Chunk_Points loop
         Ch := Next_Of (Ch);
         At_K := At_K - Chunk_Points;
      end loop;
      return Chunks (Ch) (At_K);
   end Point_Of;

   procedure Drop_Front (S : in out Population_State; I : Integer_32; N : Integer_32) is
      P : Person_Rec renames S.People (I);
      K : Integer_32;
   begin
      if N >= P.Path_Len then
         Free_Route (S, I);
         return;
      end if;
      P.Path_Len := P.Path_Len - N;
      P.Path_Off := P.Path_Off + N;
      while P.Path_Off >= Chunk_Points loop
         K := Next_Of (P.Path_Head);
         Give (P.Path_Head);
         P.Path_Head := K;
         P.Path_Off := P.Path_Off - Chunk_Points;
      end loop;
   end Drop_Front;

   procedure Store_Route
     (S : in out Population_State; I : Integer_32; List : Point_List; N : Integer_32)
   is
      Last, K : Integer_32 := No_Id;
   begin
      Free_Route (S, I);
      for J in 0 .. N - 1 loop
         if J mod Chunk_Points = 0 then
            K := Take;
            if K = No_Id then
               exit;  --  Full is set; the route stops short (reported)
            end if;
            if Last = No_Id then
               S.People (I).Path_Head := K;
            else
               Next_Of (Last) := K;
            end if;
            Last := K;
         end if;
         Chunks (Last) (J mod Chunk_Points) := List (J);
         S.People (I).Path_Len := J + 1;
      end loop;
   end Store_Route;

   ---------------------------------------------------------------------
   --  Hashes (hash.ts)
   ---------------------------------------------------------------------

   function H2 (Id, Salt : Integer_32) return Unsigned_32 is
     (Hood.Random.Hash32
        ((Unsigned_32'Mod (Id) * 2_654_435_761) xor (Unsigned_32'Mod (Salt + 1) * 40_503)));

   function R01 (Id, Salt : Integer_32) return Long_Float is
     (Long_Float (H2 (Id, Salt)) / 4_294_967_296.0);

   ---------------------------------------------------------------------
   --  Routes
   ---------------------------------------------------------------------

   --  The middle of the footway from a street's centre line
   --  (constants.ts PAVEMENT_OFFSET = 14 / 2 - 1.6), the road clearance
   --  every block has (cityLayout.ts streetInset 3), each walker's own
   --  line about it and his stop short of a corner (movement.ts:13-17).
   Footway_Mid    : constant Long_Float := 5.4;
   Street_Inset   : constant Long_Float := 3.0;
   Footway_Spread : constant Long_Float := 1.2;
   Corner_Stagger : constant Long_Float := 3.5;
   Stretch_Width  : constant Long_Float := 1.6;   --  FOOTWAY_SPREAD + .4

   type Precinct_Rec is record
      Found  : Boolean;
      Block  : Integer_32;
      Inside : Boolean;
   end record;

   function Precinct (C : Hood.City.City_State; X, Y : Long_Float) return Precinct_Rec is
      B : constant Integer_32 :=
        Hood.Streets.Block_At (C, Floor_Int (X / Cell), Floor_Int (Y / Cell));
      RX, RY, RW, RH : Long_Float;
   begin
      if B = No_Id then
         return (False, No_Id, False);
      end if;
      RX := Long_Float (Block_Rect_X (C.Blocks (B)));
      RY := Long_Float (Block_Rect_Y (C.Blocks (B)));
      RW := Long_Float (Block_Rect_W (C.Blocks (B)));
      RH := Long_Float (Block_Rect_H (C.Blocks (B)));
      if X < RX - 3.0 or else Y < RY - 3.0 or else X > RX + RW + 3.0 or else Y > RY + RH + 3.0 then
         return (False, No_Id, False);
      end if;
      return (True, B, X >= RX and then Y >= RY and then X <= RX + RW and then Y <= RY + RH);
   end Precinct;

   function Same_Footway (AX, AY, BX, BY : Long_Float) return Boolean is
   begin
      if abs (AY - BY) < 1.5 then
         return Floor (AX / Cell) = Floor (BX / Cell);
      end if;
      if abs (AX - BX) < 1.5 then
         return Floor (AY / Cell) = Floor (BY / Cell);
      end if;
      return False;
   end Same_Footway;

   function On_Stretch (PX, PY : Long_Float; A, B : Point) return Boolean is
      DX : constant Long_Float := B.X - A.X;
      DY : constant Long_Float := B.Y - A.Y;
      Len2 : constant Long_Float := DX * DX + DY * DY;
      T : Long_Float;
   begin
      if Len2 < 1.0E-6 then
         return False;
      end if;
      T := ((PX - A.X) * DX + (PY - A.Y) * DY) / Len2;
      if T <= 0.0 or else T >= 1.0 then
         return False;
      end if;
      return abs ((PX - A.X) * DY - (PY - A.Y) * DX) / Sqrt (Len2) < Stretch_Width;
   end On_Stretch;

   procedure Footway_Route
     (C : Hood.City.City_State; FX, FY, TX, TY : Long_Float; Id : Integer_32;
      List : out Point_List; N : out Integer_32)
   is
      A : constant Precinct_Rec := Precinct (C, FX, FY);
      B : constant Precinct_Rec := Precinct (C, TX, TY);
      Zig : constant Boolean := Id mod 2 = 0;
      Pavement : constant Long_Float := Footway_Mid + Street_Inset;
      KX : constant Long_Float := Pavement + (R01 (Id, 5) - 0.5) * 2.0 * Footway_Spread;
      KY : constant Long_Float := Pavement + (R01 (Id, 6) - 0.5) * 2.0 * Footway_Spread;
      Stagger : constant Long_Float := R01 (Id, 7) * Corner_Stagger;
      Nodes : Hood.Streets.Node_List;
      Count : Integer_32;
      SX, SY, DX, DY, TXS, TYS : Long_Float;
      AXn, AYn, BXn, BYn, EX, EY : Long_Float;

      procedure Push (X, Y, Cross : Long_Float) is
      begin
         if N < Max_Path_Points then
            List (N) := (X, Y, Cross);
            N := N + 1;
         end if;
      end Push;

      procedure Corner (NX, NY, CX, CY : Long_Float; Crossing : Boolean) is
         PrevX : constant Long_Float := (if N > 0 then List (N - 1).X else FX);
         PrevY : constant Long_Float := (if N > 0 then List (N - 1).Y else FY);
         PX : Long_Float := NX + CX * KX;
         PY : Long_Float := NY + CY * KY;
         AX, AY : Long_Float;
      begin
         if Crossing then
            Push (PX, PY, Hypot (PrevX - PX, PrevY - PY));
         else
            AX := PX - PrevX;
            AY := PY - PrevY;
            if abs AX > abs AY and then abs AX > Stagger then
               PX := PX - Sign (AX) * Stagger;
            elsif abs AY > Stagger then
               PY := PY - Sign (AY) * Stagger;
            end if;
            Push (PX, PY, 0.0);
         end if;
      end Corner;

      function Or_Else (V, Other : Long_Float) return Long_Float is (if V /= 0.0 then V else Other);
   begin
      N := 0;
      List := [others => (0.0, 0.0, 0.0)];
      if A.Found and then B.Found and then A.Block = B.Block and then (A.Inside or B.Inside) then
         Push (TX, TY, 0.0);
         return;
      end if;
      Hood.Streets.Route (FX, FY, TX, TY, Zig, Nodes, Count);
      if Count = 0 then
         Push (TX, TY, 0.0);  --  1.2.91 stops with an error here (proposed)
         return;
      end if;
      AXn := Hood.Streets.Node_X (Nodes (1));
      AYn := Hood.Streets.Node_Y (Nodes (1));
      SX := Or_Else (Sign (FX - AXn), 1.0);
      SY := Or_Else (Sign (FY - AYn), 1.0);
      Corner (AXn, AYn, SX, SY, False);
      for K in 1 .. Integer (Count) - 1 loop
         AXn := Hood.Streets.Node_X (Nodes (K));
         AYn := Hood.Streets.Node_Y (Nodes (K));
         BXn := Hood.Streets.Node_X (Nodes (K + 1));
         BYn := Hood.Streets.Node_Y (Nodes (K + 1));
         DX := Sign (BXn - AXn);
         DY := Sign (BYn - AYn);
         Push (AXn + SX * KX, AYn + SY * KY, 0.0);
         if DX /= 0.0 then
            if SX /= DX then
               SX := DX;
               Corner (AXn, AYn, SX, SY, True);
            end if;
            SX := -DX;
            Corner (BXn, BYn, SX, SY, False);
         elsif DY /= 0.0 then
            if SY /= DY then
               SY := DY;
               Corner (AXn, AYn, SX, SY, True);
            end if;
            SY := -DY;
            Corner (BXn, BYn, SX, SY, False);
         end if;
      end loop;
      EX := Hood.Streets.Node_X (Nodes (Integer (Count)));
      EY := Hood.Streets.Node_Y (Nodes (Integer (Count)));
      Push (EX + SX * KX, EY + SY * KY, 0.0);
      TXS := Or_Else (Sign (TX - EX), SX);
      TYS := Or_Else (Sign (TY - EY), SY);
      declare
         Beside_Row : constant Boolean := abs (TY - EY) <= Pavement + 1.5;
         Beside_Col : constant Boolean := abs (TX - EX) <= Pavement + 1.5;
      begin
         if Beside_Row and then not Beside_Col then
            if SY /= TYS then
               SY := TYS;
               Corner (EX, EY, SX, SY, True);
            end if;
            if SX /= TXS then
               SX := TXS;
               Corner (EX, EY, SX, SY, True);
            end if;
         else
            if SX /= TXS then
               SX := TXS;
               Corner (EX, EY, SX, SY, True);
            end if;
            if SY /= TYS then
               SY := TYS;
               Corner (EX, EY, SX, SY, True);
            end if;
         end if;
      end;
      Push (TX, TY, 0.0);
   end Footway_Route;

   procedure Walk_Route
     (C : Hood.City.City_State; FX, FY, TX, TY : Long_Float; Id : Integer_32;
      List : out Point_List; N : out Integer_32)
   is
      Mid : Precinct_Rec;
      Drop : Integer_32 := 0;
   begin
      if Same_Footway (FX, FY, TX, TY) then
         Mid := Precinct (C, (FX + TX) / 2.0, (FY + TY) / 2.0);
         if not (Mid.Found and then Mid.Inside) then
            List := [others => (0.0, 0.0, 0.0)];
            List (0) := (TX, TY, 0.0);
            N := 1;
            return;
         end if;
      end if;
      Footway_Route (C, FX, FY, TX, TY, Id, List, N);
      --  trimDoubling: no going on to a corner and back.
      while N - Drop >= 2 and then List (Drop).Cross = 0.0 and then List (Drop + 1).Cross = 0.0
        and then On_Stretch (FX, FY, List (Drop), List (Drop + 1))
      loop
         Drop := Drop + 1;
      end loop;
      if Drop > 0 then
         for K in 0 .. N - Drop - 1 loop
            List (K) := List (K + Drop);
         end loop;
         N := N - Drop;
      end if;
      if N >= 3 and then List (N - 2).Cross = 0.0
        and then On_Stretch (List (N - 1).X, List (N - 1).Y, List (N - 3), List (N - 2))
      then
         List (N - 2) := List (N - 1);
         N := N - 1;
      end if;
   end Walk_Route;

   function Walk_Length
     (C : Hood.City.City_State; FX, FY, TX, TY : Long_Float; Id : Integer_32) return Long_Float
   is
      List : Point_List;
      N : Integer_32;
      Len : Long_Float := 0.0;
      AX : Long_Float := FX;
      AY : Long_Float := FY;
   begin
      Walk_Route (C, FX, FY, TX, TY, Id, List, N);
      for K in 0 .. N - 1 loop
         Len := Len + Hypot (AX - List (K).X, AY - List (K).Y);
         AX := List (K).X;
         AY := List (K).Y;
      end loop;
      return Len + Hypot (AX - TX, AY - TY);
   end Walk_Length;

   function Route_Length (S : Population_State; I : Integer_32) return Long_Float is
      P : Person_Rec renames S.People (I);
      Len : Long_Float := 0.0;
      AX : Long_Float := P.X;
      AY : Long_Float := P.Y;
      Q : Point;
   begin
      if not P.Walking then
         return 0.0;
      end if;
      for K in 0 .. P.Path_Len - 1 loop
         Q := Point_Of (S, I, K);
         Len := Len + Hypot (AX - Q.X, AY - Q.Y);
         AX := Q.X;
         AY := Q.Y;
      end loop;
      return Len + Hypot (AX - P.DX, AY - P.DY);
   end Route_Length;

   procedure Set_Destination
     (S : in out Population_State; C : Hood.City.City_State; I : Integer_32; TX, TY : Long_Float)
   is
      List : Point_List;
      N : Integer_32;
   begin
      S.People (I).DX := TX;
      S.People (I).DY := TY;
      S.People (I).Walking := True;
      S.People (I).Halted := False;
      Walk_Route (C, S.People (I).X, S.People (I).Y, TX, TY, S.People (I).Id, List, N);
      Store_Route (S, I, List, N);
   end Set_Destination;

   procedure Clear_Destination (S : in out Population_State; I : Integer_32) is
   begin
      S.People (I).Walking := False;
      S.People (I).Halted := False;
      Free_Route (S, I);
   end Clear_Destination;

   ---------------------------------------------------------------------
   --  Stepping
   ---------------------------------------------------------------------

   Walk_Pace : constant Long_Float := 0.54;   --  constants.ts:33 WALK_SPEED, 1.8 / (10 / 3)
   Hurry     : constant Long_Float := 0.81;   --  x PURSUIT_PACE 1.5 (transport.ts:25)

   function Walk_Speed return Long_Float is (Walk_Pace);

   --  transport.ts runningCivilian: chosen from the person and the leg's
   --  destination.
   function Running (P : Person_Rec) return Boolean is
      N : Integer_64;
   begin
      if P.Kind /= R_Citizen or else not P.Walking then
         return False;
      end if;
      N := Integer_64 (P.Id) * 7919 + Integer_64 (Round (P.DX * 4.0)) * 131
        + Integer_64 (Round (P.DY * 4.0));
      return Hood.Random.Hash32 (Unsigned_32'Mod (N)) mod 64 = 0;
   end Running;

   function Speed (S : Population_State; I : Integer_32) return Long_Float is
     (if Running (S.People (I)) then Hurry else Walk_Pace);

   --  transport.ts transportSpeed at the wheel: the car's pace and its
   --  driver's skill.
   function Drive_Pace (S : Population_State; I : Integer_32) return Long_Float is
      V : constant Integer_32 := S.People (I).Vehicle;
      D : Integer_32 := I;
      K : Long_Float := 1.0;
   begin
      if V /= No_Id then
         K := Transport.Pace (S.Fleet (V).Kind);
         if S.Fleet (V).Driver /= No_Id then
            D := S.Fleet (V).Driver;
         end if;
      end if;
      return Transport.Drive_Speed * K * (0.75 + Transport.Driving (S, D) * 0.1);
   end Drive_Pace;

   function Step
     (S : in out Population_State; C : Hood.City.City_State; I : Integer_32;
      Traffic : Boolean) return Boolean
   is
      pragma Unreferenced (C);
      P : Person_Rec renames S.People (I);
      Car : constant Boolean := P.In_Vehicle;
      Budget : Long_Float;
      Index  : Integer_32 := 0;
      Q : Point;
      DX, DY, D : Long_Float;
   begin
      if not P.Walking then
         return True;
      end if;
      P.Halted := False;
      Budget := (if Car then Drive_Pace (S, I) else Speed (S, I));
      --  Mid-block on foot: one step toward the next corner, almost always
      --  still short of it (movement.ts:381-394).
      if not Car and then P.Path_Len > 0 then
         Q := Point_Of (S, I, 0);
         DX := Q.X - P.X;
         DY := Q.Y - P.Y;
         D := (if DY = 0.0 then abs DX elsif DX = 0.0 then abs DY else Hypot (DX, DY));
         if Traffic and then Q.Cross /= 0.0 and then D >= Q.Cross - 0.75
           and then Hood.Population.Traffic.Crossing_Has_Traffic (S, P.X, P.Y, Q.X, Q.Y)
         then
            P.Halted := True;
            return False;
         end if;
         if D > Budget then
            if DY = 0.0 then
               P.X := P.X + (if DX < 0.0 then -Budget else Budget);
            elsif DX = 0.0 then
               P.Y := P.Y + (if DY < 0.0 then -Budget else Budget);
            else
               P.X := P.X + (DX / D) * Budget;
               P.Y := P.Y + (DY / D) * Budget;
            end if;
            return False;
         end if;
      end if;
      while Budget > 0.0 loop
         if Index >= P.Path_Len then
            P.X := P.DX;
            P.Y := P.DY;
            Clear_Destination (S, I);
            return True;
         end if;
         Q := Point_Of (S, I, Index);
         DX := Q.X - P.X;
         DY := Q.Y - P.Y;
         D := Hypot (DX, DY);
         if Traffic and then not Car and then Q.Cross /= 0.0 and then D >= Q.Cross - 0.75
           and then Hood.Population.Traffic.Crossing_Has_Traffic (S, P.X, P.Y, Q.X, Q.Y)
         then
            P.Halted := True;
            Drop_Front (S, I, Index);
            return False;
         end if;
         --  At the wheel: somebody on a crossing ahead means a stop; a
         --  slower car in front, closing up behind it.
         if Traffic and then Car and then D > 0.5 then
            if Hood.Population.Traffic.Road_Ahead_Blocked (P.X, P.Y, Q.X, Q.Y) then
               P.Halted := True;
               Drop_Front (S, I, Index);
               return False;
            end if;
            declare
               V : constant Integer_32 := P.Vehicle;
               Self : constant Integer_32 :=
                 (if V /= No_Id and then S.Fleet (V).Driver /= No_Id then S.Fleet (V).Driver else I);
               Has_After : constant Boolean := Index + 1 < P.Path_Len;
               F : constant Point :=
                 (if Has_After then Point_Of (S, I, Index + 1) else (X => 0.0, Y => 0.0, Cross => 0.0));
            begin
               Budget := Min (Budget, Hood.Population.Traffic.Road_Ahead_Room
                                (S, Self, P.X, P.Y, Q.X, Q.Y, Has_After, F.X, F.Y));
            end;
            if Budget <= 0.0 then
               Drop_Front (S, I, Index);
               return False;
            end if;
         end if;
         if D <= Budget then
            P.X := Q.X;
            P.Y := Q.Y;
            Index := Index + 1;
            Budget := Budget - D;
            if Index >= P.Path_Len then
               Clear_Destination (S, I);
               return True;
            end if;
         else
            P.X := P.X + (DX / D) * Budget;
            P.Y := P.Y + (DY / D) * Budget;
            Budget := 0.0;
         end if;
      end loop;
      Drop_Front (S, I, Index);
      return False;
   end Step;

   ---------------------------------------------------------------------
   --  Doors (world.ts lotFacing :143-152, buildingDoor :155-170)
   ---------------------------------------------------------------------

   procedure Door
     (S : Population_State; C : Hood.City.City_State; B : Integer_32; X, Y : out Long_Float)
   is
      E : constant Integer_32 :=
        (if S.Extra (B).Front_Of /= No_Id then S.Extra (B).Front_Of else B);
      L : Hood.City.Lot_Rec renames C.Lots (C.Buildings (E).Lot);
      K : Hood.City.Block_Rec renames C.Blocks (C.Buildings (E).Block);
      RX : constant Long_Float := Long_Float (Block_Rect_X (K));
      RY : constant Long_Float := Long_Float (Block_Rect_Y (K));
      RW : constant Long_Float := Long_Float (Block_Rect_W (K));
      RH : constant Long_Float := Long_Float (Block_Rect_H (K));
      F  : Facing;
   begin
      if not C.Standard then
         F := L.Face;
      else
         declare
            OX : constant Long_Float := L.CX - Long_Float (K.Center_X) / 256.0;
            OZ : constant Long_Float := L.CY - Long_Float (K.Center_Y) / 256.0;
         begin
            if L.FH > L.FW * 1.2 then
               F := (if OX < -0.01 then West else East);
            elsif L.FW > L.FH * 1.2 then
               F := (if OZ < -0.01 then North else South);
            elsif abs OX > abs OZ then
               F := (if OX > 0.0 then East else West);
            elsif abs OZ > 0.01 then
               F := (if OZ > 0.0 then South else North);
            else
               F := (case H2 (C.Buildings (E).Id, 41) mod 4 is
                        when 0 => South, when 1 => East, when 2 => North, when others => West);
            end if;
         end;
      end if;
      case F is
         when North => X := L.CX; Y := RY - 1.6;
         when South => X := L.CX; Y := RY + RH + 1.6;
         when West  => X := RX - 1.6; Y := L.CY;
         when East  => X := RX + RW + 1.6; Y := L.CY;
      end case;
   end Door;

end Hood.Population.Walk;
