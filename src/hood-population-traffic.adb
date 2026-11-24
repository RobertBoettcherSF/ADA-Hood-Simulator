with Hood.Floats;
with Hood.Streets;
with Hood.Population.Walk;
with Hood.Random;

package body Hood.Population.Traffic is

   --  The capacity check below raises; in the wasm build that reaches the last-chance
   --  handler, which reports the file and line to the page.
   pragma Warnings (Off, "pragma Restrictions (No_Exception_Propagation)");
   pragma Warnings (Off, "Last_Chance_Handler will be called");

   use Hood.Floats;
   use type Hood.City.Block_Use;
   package St renames Hood.Streets;

   Plan_Bridge : constant := 37;  --  the plan's road bridge content id

   Cell : constant Long_Float := 54.0;

   --  traffic.ts:13-30 (all from 1.2.91).
   Walker_Lead     : constant Long_Float := 14.0;
   Car_Margin      : constant Long_Float := 4.0;
   Car_Clearance   : constant Long_Float := -5.0;
   Driver_Radius   : constant Long_Float := 20.0;
   Braking         : constant Long_Float := 12.0;
   Follow_Gap      : constant Long_Float := 7.0;
   Same_Lane       : constant Long_Float := 1.8;
   In_The_Way      : constant Long_Float := 2.0;
   Body_In_Lane    : constant Long_Float := 3.1;
   Clear_Past      : constant Long_Float := 4.5;
   Junction        : constant Long_Float := 4.0;
   Give_Way_Line   : constant Long_Float := 5.5;
   Give_Way_Inside : constant Long_Float := 5.4;
   Give_Way_Look   : constant Long_Float := 16.0;
   Junction_Box    : constant Long_Float := 5.0;
   Lane_Offset     : constant Long_Float := 1.95;   --  constants.ts LANE_OFFSET
   Street_Half     : constant Long_Float := 7.0;    --  STREET_WIDTH / 2
   Speed           : constant Long_Float := 1.035;  --  23 * 0.15 / (10 / 3)
   Cars_Per_Street : constant Long_Float := 0.06;

   type Int4 is array (Integer_32 range 0 .. 3) of Integer_32;
   HX : constant Int4 := [1, 0, -1, 0];
   HY : constant Int4 := [0, 1, 0, -1];

   function Lane_X (D : Integer_32) return Long_Float is (-Long_Float (HY (D)) * Lane_Offset);
   function Lane_Y (D : Integer_32) return Long_Float is (Long_Float (HX (D)) * Lane_Offset);

   ---------------------------------------------------------------------
   --  The timetable
   ---------------------------------------------------------------------

   type Spec_Rec is record
      Node   : Integer_32;
      Dir    : Integer_32;
      Phase  : Long_Float;
      Truck  : Boolean;
      Colour : Integer_32;
   end record;

   --  A car's drive: the corners it has turned, a window of them (the
   --  ones behind are dropped; the timetable only runs forward).
   Window : constant := 32;  --  proposed
   type F_Window is array (Integer_32 range 0 .. Window - 1) of Long_Float;
   type I_Window is array (Integer_32 range 0 .. Window - 1) of Integer_32;
   Max_Plan : constant := 160;  --  junctions of one trip (proposed)
   type Plan_List is array (Integer_32 range 0 .. Max_Plan - 1) of Integer_8;

   type Drive_Rec is record
      Started  : Boolean;
      Len      : Integer_32;
      X, Y, At_D : F_Window;
      Head, Junc : I_Window;
      Next, Dir, Turns : Integer_32;
      Plan     : Plan_List;
      Plan_Off, Plan_Len : Integer_32;
      Trips    : Integer_32;
   end record;

   type Car_Rec is record
      X, Y, S  : Long_Float;
      Axis_X   : Boolean;
      Line     : Integer_32;
      Dir      : Integer_32;  --  1 or -1
      Head     : Integer_32;
      Has_J    : Boolean;
      JX, JY, Ahead : Long_Float;
      Exit_H   : Integer_32;
   end record;

   type Spec_Array is array (Integer_32 range 0 .. Max_Cars - 1) of Spec_Rec;
   type Drive_Array is array (Integer_32 range 0 .. Max_Cars - 1) of Drive_Rec;
   type Car_Array is array (Integer_32 range 0 .. Max_Cars - 1) of Car_Rec;
   type Int_Cars is array (Integer_32 range 0 .. Max_Cars - 1) of Integer_32;
   type Bool_Cars is array (Integer_32 range 0 .. Max_Cars - 1) of Boolean;

   N_Cars  : Integer_32 := 0;
   Specs   : Spec_Array;
   Drives  : Drive_Array;
   Cars    : Car_Array;
   Delay_M : Int_Cars;
   Waited  : Int_Cars;
   Halted  : Bool_Cars;
   Original : Boolean := False;
   Grid_W, Grid_H, Width : Integer_32 := 0;

   --  Trip table (traffic.ts tripTable).
   type Value_Array is array (Integer_32 range 0 .. Hood.City.Max_Blocks - 1) of Integer_16;
   type River_Array is array (Integer_32 range 0 .. 63) of Integer_16;
   Values : Value_Array;
   River_Lo, River_Hi : River_Array;

   --  Streets: cars by street key (line * 2 + along x), rebuilt with the
   --  positions.
   Max_Keys : constant := 2 * 64;
   type Key_Index is array (Integer_32 range 0 .. Max_Keys) of Integer_32;
   Car_Start : Key_Index;
   Car_Order : Int_Cars;

   function Street_Key (Axis_X : Boolean; Line : Integer_32) return Integer_32 is
     (Line * 2 + (if Axis_X then 1 else 0));

   function Valid_Key (K : Integer_32) return Boolean is (K in 0 .. Max_Keys - 1);

   ---------------------------------------------------------------------
   --  Crossings and drivers (two scans: the minute's and the one before)
   ---------------------------------------------------------------------

   Max_Crossings : constant := 4_096;  --  proposed
   Max_Drivers   : constant := 256;
   type Crossing_Rec is record
      Axis_X : Boolean;
      Line   : Integer_32;
      S      : Long_Float;
      WX, WY : Long_Float;
   end record;
   type Crossing_Array is array (Integer_32 range 1 .. Max_Crossings) of Crossing_Rec;
   type Driver_Array is array (Integer_32 range 1 .. Max_Drivers) of Integer_32;

   type Scan_Rec is record
      N_Cross   : Integer_32 := 0;
      Crossings : Crossing_Array;
      N_Drivers : Integer_32 := 0;
      Drivers   : Driver_Array;
   end record;

   Scans : array (0 .. 1) of Scan_Rec;
   Fresh_Ix : Integer := 0;   --  being collected by the slices

   function Is_Driver (S : Population_State; I : Integer_32) return Boolean is
     (S.People (I).Vehicle = No_Id
      or else S.Fleet (S.People (I).Vehicle).Driver = I);

   procedure Add_Person (Into : in out Scan_Rec; S : Population_State; I : Integer_32) is
      P : Person_Rec renames S.People (I);
   begin
      if not P.Walking or else P.Status /= Active then
         return;
      end if;
      if P.In_Vehicle then
         if Is_Driver (S, I) then
            if Into.N_Drivers < Max_Drivers then
               Into.N_Drivers := Into.N_Drivers + 1;
               Into.Drivers (Into.N_Drivers) := I;
            end if;
         end if;
         return;
      end if;
      if P.Path_Len = 0 then
         return;
      end if;
      declare
         Q : constant Walk.Point := Walk.Point_Of (S, I, 0);
      begin
         if Q.Cross = 0.0 then
            return;
         end if;
         if Hypot (Q.X - P.X, Q.Y - P.Y) < Q.Cross - 0.75 and then Into.N_Cross < Max_Crossings then
            declare
               MX : constant Long_Float := (P.X + Q.X) / 2.0;
               MY : constant Long_Float := (P.Y + Q.Y) / 2.0;
               Along_X : constant Boolean := abs (Q.X - P.X) >= abs (Q.Y - P.Y);
               X : Crossing_Rec;
            begin
               X.Axis_X := not Along_X;
               X.Line := Round_Int ((if Along_X then MX else MY) / Cell);
               X.S := (if Along_X then MY else MX);
               X.WX := P.X;
               X.WY := P.Y;
               Into.N_Cross := Into.N_Cross + 1;
               Into.Crossings (Into.N_Cross) := X;
            end;
         end if;
      end;
   end Add_Person;

   ---------------------------------------------------------------------
   --  Building the timetable
   ---------------------------------------------------------------------

   function H2 (Id, Salt : Integer_32) return Unsigned_32 renames Walk.H2;
   function R01 (Id, Salt : Integer_32) return Long_Float renames Walk.R01;

   function H2_64 (Id : Integer_64; Salt : Integer_32) return Unsigned_32 is
     (Hood.Random.Hash32
        ((Unsigned_32'Mod (Id) * 2_654_435_761) xor (Unsigned_32'Mod (Salt + 1) * 40_503)));
   --  h2 of a number past 32 bits: Math.imul keeps its low 32.

   function Open (N, T : Integer_32) return Boolean is
     (N + HY (T) * Width + HX (T) in 0 .. St.Node_Count - 1
      and then St.Opens (N, N + HY (T) * Width + HX (T)));

   procedure Build (C : Hood.City.City_State) is
      Lanes : array (Integer_32 range 0 .. 4 * St.Max_Nodes - 1) of Integer_32;
      L     : Integer_32 := 0;
      Ends  : Integer_32 := 0;
   begin
      Grid_W := C.W;
      Grid_H := C.H;
      Width := C.W + 1;
      Original := C.Standard;
      for I in 0 .. St.Node_Count - 1 loop
         Ends := Ends + St.Ways (I);
         for D in Integer_32 range 0 .. 3 loop
            if Open (I, D) then
               Lanes (L) := I * 4 + D;
               L := L + 1;
            end if;
         end loop;
      end loop;
      --  Sort by h2(lane, 91), then the lane (insertion sort; a few
      --  thousand lanes once a game).
      for I in 1 .. L - 1 loop
         declare
            V : constant Integer_32 := Lanes (I);
            HV : constant Unsigned_32 := H2 (V, 91);
            J : Integer_32 := I - 1;
         begin
            while J >= 0 and then
              (H2 (Lanes (J), 91) > HV or else (H2 (Lanes (J), 91) = HV and then Lanes (J) > V))
            loop
               Lanes (J + 1) := Lanes (J);
               J := J - 1;
            end loop;
            Lanes (J + 1) := V;
         end;
      end loop;
      if Ends = 0 then
         N_Cars := 0;
      else
         N_Cars := Integer_32'Min
           (Max_Cars, Integer_32'Max (12, Round_Int (Long_Float (Ends) / 2.0 * Cars_Per_Street)));
      end if;
      if L = 0 then
         N_Cars := 0;
      end if;
      for K in 0 .. N_Cars - 1 loop
         declare
            Lane  : constant Integer_32 := Lanes (K mod L);
            Round : constant Integer_32 := K / L;
            Ph    : constant Long_Float :=
              0.15 + 0.7 * R01 (K, 98) + Long_Float (Round) * 0.37;
         begin
            Specs (K) := (Node   => Lane / 4,
                          Dir    => Lane mod 4,
                          Phase  => Ph - Floor (Ph),  --  % 1 of a positive value
                          Truck  => R01 (K, 94) < 0.3,
                          Colour => Integer_32 (H2 (K, 97) mod 8));
            Drives (K).Started := False;
            Delay_M (K) := 0;
            Waited (K) := 0;
            Halted (K) := False;
         end;
      end loop;
      --  The trip table.
      Values := [others => -1];
      River_Lo := [others => -1];
      River_Hi := [others => -1];
      for B in 0 .. C.Block_Count - 1 loop
         declare
            R : Hood.City.Block_Rec renames C.Blocks (B);
         begin
            if R.GX in 0 .. C.W - 1 and then R.GY in 0 .. C.H - 1 then
               if R.Use_Of in Hood.City.Urban | Hood.City.Civic_Site
                 and then R.Merged_Into = Hood.City.No_Id
               then
                  Values (R.GY * C.W + R.GX) :=
                    Integer_16 (if C.Standard then R.Plan_Value else 0);
               end if;
               if R.Use_Of = Hood.City.Water
                 or else (C.Standard and then R.Content = Plan_Bridge)
               then
                  if River_Lo (R.GX) < 0 or else Integer_16 (R.GY) < River_Lo (R.GX) then
                     River_Lo (R.GX) := Integer_16 (R.GY);
                  end if;
                  if Integer_16 (R.GY) > River_Hi (R.GX) then
                     River_Hi (R.GX) := Integer_16 (R.GY);
                  end if;
               end if;
            end if;
         end;
      end loop;
      Scans (Fresh_Ix).N_Cross := 0;
      Scans (Fresh_Ix).N_Drivers := 0;
      Scans (1 - Fresh_Ix).N_Cross := 0;
      Scans (1 - Fresh_Ix).N_Drivers := 0;
   end Build;

   ---------------------------------------------------------------------
   --  Trips (Standard city: traffic.ts drawTripGoal, tripRoute)
   ---------------------------------------------------------------------

   Trip_Thresholds : constant array (Integer_32 range 0 .. 9) of Integer_32 :=
     [10, 30, 140, 140, 110, 90, 70, 50, 30, 20];

   function River_Side (Col, Row : Integer_32; At_Junction : Boolean) return Integer_32 is
      CC : constant Integer_32 := Integer_32'Min (Col, Grid_W - 1);
      Lo : constant Integer_32 := Integer_32 (River_Lo (CC));
      Hi : constant Integer_32 := Integer_32 (River_Hi (CC));
   begin
      if Lo < 0 then
         return 0;
      elsif At_Junction then
         return (if Row <= Lo then -1 elsif Row > Hi then 1 else 0);
      else
         return (if Row < Lo then -1 elsif Row > Hi then 1 else 0);
      end if;
   end River_Side;

   procedure Block_Side (GX, GY, Side : Integer_32; A, B : out Integer_32) is
      function N (X, Y : Integer_32) return Integer_32 is (Y * Width + X);
   begin
      case Side is
         when 0 => A := N (GX, GY); B := N (GX, GY + 1);
         when 1 => A := N (GX, GY + 1); B := N (GX + 1, GY + 1);
         when 2 => A := N (GX, GY); B := N (GX + 1, GY);
         when others => A := N (GX + 1, GY); B := N (GX + 1, GY + 1);
      end case;
   end Block_Side;

   procedure Draw_Trip_Goal
     (K, Seed, Node : Integer_32; Found : out Boolean; GA, GB : out Integer_32)
   is
      NX : constant Integer_32 := Node mod Width;
      NY : constant Integer_32 := Node / Width;
      I  : Integer_64 := 0;
      Base : constant Integer_64 := Integer_64 (K) * 7919 + Integer_64 (Seed) * 104_729;
      function Rand return Integer_32 is
         V : constant Unsigned_32 := H2_64 (Base + I, 107) and 16#7FFF_FFFF#;
      begin
         I := I + 1;
         return Integer_32 (V);
      end Rand;
      Span_X : constant Integer_32 := 5 * Grid_W - 10;
      Span_Y : constant Integer_32 := 5 * Grid_H - 10;
      R, Threshold, Own : Integer_32;
      Any_Side : Boolean;
      Tries : Integer_32 := 0;
   begin
      Found := False;
      GA := -1;
      GB := -1;
      if Span_X <= 0 or else Span_Y <= 0 then
         return;
      end if;
      R := Rand mod 10;
      Threshold := Trip_Thresholds (R);
      Any_Side := R = 1;
      Own := River_Side (NX, NY, True);
      while Tries < 400 and then not (Tries > 99 and then Found) loop
         declare
            CX, CY : Integer_32 := 0;
            GX, GY, Value, Start : Integer_32;
            EA, EB : Integer_32 := -1;
            Have : Boolean := False;
         begin
            for N in 1 .. 64 loop
               CX := 5 + Rand mod Span_X;
               CY := 5 + Rand mod Span_Y;
               exit when abs (CX - NX * 5) > 9 or else abs (CY - NY * 5) >= 10;
            end loop;
            GX := CX / 5;
            GY := CY / 5;
            Value := Integer_32 (Values (GY * Grid_W + GX));
            if Value >= 0 then
               Start := Rand mod 4;
               for S in Integer_32 range 0 .. 3 loop
                  exit when Have;
                  declare
                     A, B : Integer_32;
                  begin
                     Block_Side (GX, GY, (Start + S) mod 4, A, B);
                     if St.Opens (A, B) then
                        EA := A;
                        EB := B;
                        Have := True;
                     end if;
                  end;
               end loop;
               if Have then
                  declare
                     Skip : Boolean := False;
                  begin
                     if not Any_Side then
                        declare
                           There : constant Integer_32 := River_Side (GX, GY, False);
                        begin
                           Skip := Own /= 0 and then There /= 0 and then Own /= There;
                        end;
                     end if;
                     if not Skip then
                        Found := True;
                        GA := EA;
                        GB := EB;
                        if Value > Threshold and then (Rand mod 256) < Value then
                           return;
                        end if;
                     end if;
                  end;
               end if;
            end if;
         end;
         Tries := Tries + 1;
      end loop;
   end Draw_Trip_Goal;

   Route_Order : constant Int4 := [0, 1, 3, 2];
   Route_Turn  : constant Int4 := [0, 100, 200, 101];

   Max_States : constant := 4 * St.Max_Nodes;
   type State_Ints is array (Integer_32 range 0 .. Max_States - 1) of Integer_32;
   Seen, Hops, Cost, Pred, Queue : State_Ints;
   Stamp : Integer_32 := 0;

   procedure Trip_Route
     (Node, D, A, B : Integer_32; Ways : out Plan_List; N : out Integer_32)
   is
      First : constant Integer_32 := Node * 4 + D;
      Head, Tail : Integer_32 := 0;
      Best_Hops, Best_Cost : Integer_32 := Integer_32'Last;
      Best_State, Best_Way : Integer_32 := -1;
      Mask : Integer_32;
   begin
      N := 0;
      Stamp := Stamp + 1;
      Seen (First) := Stamp;
      Hops (First) := 0;
      Cost (First) := 0;
      Pred (First) := First;
      Queue (Tail) := First;
      Tail := Tail + 1;
      while Head < Tail loop
         declare
            S : constant Integer_32 := Queue (Head);
            NN : constant Integer_32 := S / 4;
            H : constant Integer_32 := S mod 4;
            Onward, Allowed : Integer_32;
         begin
            Head := Head + 1;
            exit when Hops (S) + 1 > Best_Hops;
            Mask := 0;
            for T in Integer_32 range 0 .. 3 loop
               if Open (NN, T) then
                  Mask := Mask + 2**Natural (T);
               end if;
            end loop;
            Onward := Integer_32 (Unsigned_32 (Mask) and
              (2**Natural (H) or 2**Natural ((H + 1) mod 4) or 2**Natural ((H + 3) mod 4)));
            Allowed := (if Onward /= 0 then Onward
                        else Integer_32 (Unsigned_32 (Mask) and 2**Natural ((H + 2) mod 4)));
            for I in Integer_32 range 0 .. 3 loop
               declare
                  T : constant Integer_32 := (H + Route_Order (I)) mod 4;
               begin
                  if (Unsigned_32 (Allowed) and 2**Natural (T)) /= 0 then
                     declare
                        Nxt : constant Integer_32 := NN + HY (T) * Width + HX (T);
                        CC  : constant Integer_32 := Cost (S) + Route_Turn (Route_Order (I));
                     begin
                        if (NN = A and then Nxt = B) or else (NN = B and then Nxt = A) then
                           if Hops (S) + 1 < Best_Hops or else CC < Best_Cost then
                              Best_Hops := Hops (S) + 1;
                              Best_Cost := CC;
                              Best_State := S;
                              Best_Way := T;
                           end if;
                        else
                           declare
                              NS : constant Integer_32 := Nxt * 4 + T;
                           begin
                              if Seen (NS) /= Stamp then
                                 Seen (NS) := Stamp;
                                 Hops (NS) := Hops (S) + 1;
                                 Cost (NS) := CC;
                                 Pred (NS) := S;
                                 Queue (Tail) := NS;
                                 Tail := Tail + 1;
                              elsif Hops (NS) = Hops (S) + 1 and then CC < Cost (NS) then
                                 Cost (NS) := CC;
                                 Pred (NS) := S;
                              end if;
                           end;
                        end if;
                     end;
                  end if;
               end;
            end loop;
         end;
      end loop;
      if Best_State < 0 then
         return;
      end if;
      --  The ways backwards from the best state, then reversed.
      declare
         Rev : Plan_List;
         S : Integer_32 := Best_State;
      begin
         Rev (0) := Integer_8 (Best_Way);
         N := 1;
         while Pred (S) /= S loop
            if N >= Max_Plan then
               N := 0;  --  too long to keep (never seen): no trip
               return;
            end if;
            Rev (N) := Integer_8 (S mod 4);
            N := N + 1;
            S := Pred (S);
         end loop;
         for I in 0 .. N - 1 loop
            Ways (I) := Rev (N - 1 - I);
         end loop;
      end;
   end Trip_Route;

   procedure Original_Trip
     (K, Trip, Node, D : Integer_32; Ways : out Plan_List; N : out Integer_32)
   is
      NX : constant Integer_32 := Node mod Width;
      NY : constant Integer_32 := Node / Width;
   begin
      N := 0;
      for Attempt in Integer_32 range 0 .. 7 loop
         declare
            Found : Boolean;
            GA, GB : Integer_32;
         begin
            Draw_Trip_Goal (K, Trip * 8 + Attempt, Node, Found, GA, GB);
            if not Found then
               return;
            end if;
            declare
               AX : constant Integer_32 := GA mod Width;
               AY : constant Integer_32 := GA / Width;
               BX : constant Integer_32 := GB mod Width;
               Same : constant Boolean := (if AX = BX then AX = NX else AY = NY);
            begin
               if not Same then
                  Trip_Route (Node, D, GA, GB, Ways, N);
                  if N > 0 then
                     return;
                  end if;
               end if;
            end;
         end;
      end loop;
   end Original_Trip;

   ---------------------------------------------------------------------
   --  Drives
   ---------------------------------------------------------------------

   procedure Start_Drive (K : Integer_32) is
      Sp : Spec_Rec renames Specs (K);
      Dr : Drive_Rec renames Drives (K);
      D  : constant Integer_32 := Sp.Dir;
      Along : constant Long_Float := Sp.Phase * Cell;
   begin
      Dr.Started := True;
      Dr.Len := 1;
      Dr.X (0) := St.Node_X (Sp.Node) + Lane_X (D) + Long_Float (HX (D)) * Along;
      Dr.Y (0) := St.Node_Y (Sp.Node) + Lane_Y (D) + Long_Float (HY (D)) * Along;
      Dr.At_D (0) := 0.0;
      Dr.Head (0) := D;
      Dr.Junc (0) := -1;
      Dr.Next := Sp.Node + HY (D) * Width + HX (D);
      Dr.Dir := D;
      Dr.Turns := 0;
      Dr.Plan_Off := 0;
      Dr.Plan_Len := 0;
      Dr.Trips := 0;
   end Start_Drive;

   procedure Extend_Drive (K : Integer_32; Distance : Long_Float) is
      Dr : Drive_Rec renames Drives (K);
      Node : constant Integer_32 := Dr.Next;
      D : constant Integer_32 := Dr.Dir;
      PX : constant Long_Float := St.Node_X (Node);
      PY : constant Long_Float := St.Node_Y (Node);
      Ways : Int4;
      NW : Integer_32 := 0;
      T : Integer_32;

      procedure Push (X, Y : Long_Float; H : Integer_32) is
      begin
         if Dr.Len = Window then
            --  Drop the corners behind: keep the last one at or before
            --  the distance reached (the search starts there).
            declare
               Drop : Integer_32 := 0;
            begin
               while Drop + 1 < Dr.Len - 2 and then Dr.At_D (Drop + 1) <= Distance loop
                  Drop := Drop + 1;
               end loop;
               if Drop = 0 then
                  raise Program_Error;  --  traffic window full
               end if;
               for I in 0 .. Dr.Len - 1 - Drop loop
                  Dr.X (I) := Dr.X (I + Drop);
                  Dr.Y (I) := Dr.Y (I + Drop);
                  Dr.At_D (I) := Dr.At_D (I + Drop);
                  Dr.Head (I) := Dr.Head (I + Drop);
                  Dr.Junc (I) := Dr.Junc (I + Drop);
               end loop;
               Dr.Len := Dr.Len - Drop;
            end;
         end if;
         declare
            N : constant Integer_32 := Dr.Len - 1;
         begin
            Dr.At_D (Dr.Len) := Dr.At_D (N) + Hypot (X - Dr.X (N), Y - Dr.Y (N));
            Dr.X (Dr.Len) := X;
            Dr.Y (Dr.Len) := Y;
            Dr.Head (Dr.Len) := H;
            Dr.Junc (Dr.Len) := Node;
            Dr.Len := Dr.Len + 1;
         end;
      end Push;
   begin
      for K in Integer_32 range 0 .. 2 loop
         declare
            T0 : constant Integer_32 := (case K is when 0 => D, when 1 => (D + 1) mod 4, when others => (D + 3) mod 4);
         begin
            if Open (Node, T0) then
               Ways (NW) := T0;
               NW := NW + 1;
            end if;
         end;
      end loop;
      if NW = 0 then
         Ways (0) := (D + 2) mod 4;
         NW := 1;
      end if;
      T := Ways (Integer_32 (H2 (K * 131 + Dr.Turns, 103) mod Unsigned_32 (NW)));
      if Original then
         if Dr.Plan_Len = 0 then
            Dr.Trips := Dr.Trips + 1;
            Original_Trip (K, Dr.Trips, Node, D, Dr.Plan, Dr.Plan_Len);
            Dr.Plan_Off := 0;
         end if;
         if Dr.Plan_Len > 0 then
            declare
               Planned : constant Integer_32 := Integer_32 (Dr.Plan (Dr.Plan_Off));
            begin
               Dr.Plan_Off := Dr.Plan_Off + 1;
               Dr.Plan_Len := Dr.Plan_Len - 1;
               if Open (Node, Planned) then
                  T := Planned;
               else
                  Dr.Plan_Len := 0;
               end if;
            end;
         else
            Dr.Plan_Len := 0;
         end if;
      end if;
      if T = D then
         Push (PX + Lane_X (D), PY + Lane_Y (D), D);
      elsif T = (D + 2) mod 4 then
         Push (PX + Lane_X (D), PY + Lane_Y (D), D);
         Push (PX + Lane_X (T), PY + Lane_Y (T), T);
      else
         Push (PX + Lane_X (D) + Lane_X (T), PY + Lane_Y (D) + Lane_Y (T), D);
      end if;
      Dr.Next := Node + HY (T) * Width + HX (T);
      Dr.Dir := T;
      Dr.Turns := Dr.Turns + 1;
   end Extend_Drive;

   procedure Place_Cars (Week, Minute : Integer_32) is
      Week_Start : constant Integer_32 := Integer_32'Max (0, Week - 1) * Minutes_Per_Week;
   begin
      for K in 0 .. N_Cars - 1 loop
         declare
            Dr : Drive_Rec renames Drives (K);
            Distance : constant Long_Float :=
              Long_Float (Integer_32'Max (0, Week_Start + Minute - Delay_M (K))) * Speed;
            Lo, Hi : Integer_32;
            Span, F, X, Y : Long_Float;
            Head : Integer_32;
            C : Car_Rec renames Cars (K);
         begin
            if not Dr.Started or else Distance < Dr.At_D (0) then
               Start_Drive (K);
            end if;
            while Dr.Len < 3 or else Dr.At_D (Dr.Len - 2) <= Distance loop
               Extend_Drive (K, Distance);
            end loop;
            Lo := 0;
            Hi := Dr.Len - 1;
            while Hi - Lo > 1 loop
               declare
                  Mid : constant Integer_32 := (Lo + Hi) / 2;
               begin
                  if Dr.At_D (Mid) <= Distance then
                     Lo := Mid;
                  else
                     Hi := Mid;
                  end if;
               end;
            end loop;
            Span := Dr.At_D (Hi) - Dr.At_D (Lo);
            F := (if Span > 0.0 then Min (1.0, (Distance - Dr.At_D (Lo)) / Span) else 0.0);
            X := Dr.X (Lo) + (Dr.X (Hi) - Dr.X (Lo)) * F;
            Y := Dr.Y (Lo) + (Dr.Y (Hi) - Dr.Y (Lo)) * F;
            Head := Dr.Head (Hi);
            C.X := X;
            C.Y := Y;
            C.Head := Head;
            C.Axis_X := Head mod 2 = 0;
            C.Dir := (if Head < 2 then 1 else -1);
            C.Line := Round_Int ((if C.Axis_X then Y else X) / Cell);
            C.S := (if C.Axis_X then X else Y);
            C.Has_J := Dr.Junc (Hi) >= 0;
            if C.Has_J then
               C.JX := St.Node_X (Dr.Junc (Hi));
               C.JY := St.Node_Y (Dr.Junc (Hi));
               C.Ahead := Dr.At_D (Hi) - Distance;
               C.Exit_H := (if Hi + 1 < Dr.Len then Dr.Head (Hi + 1) else Head);
            end if;
         end;
      end loop;
      --  By street, in car order.
      Car_Start := [others => 0];
      for K in 0 .. N_Cars - 1 loop
         declare
            Key : constant Integer_32 := Street_Key (Cars (K).Axis_X, Cars (K).Line);
         begin
            if Valid_Key (Key) then
               Car_Start (Key + 1) := Car_Start (Key + 1) + 1;
            end if;
         end;
      end loop;
      for Key in Integer_32 range 1 .. Max_Keys loop
         Car_Start (Key) := Car_Start (Key) + Car_Start (Key - 1);
      end loop;
      declare
         Fill : Key_Index := Car_Start;
      begin
         for K in 0 .. N_Cars - 1 loop
            declare
               Key : constant Integer_32 := Street_Key (Cars (K).Axis_X, Cars (K).Line);
            begin
               if Valid_Key (Key) then
                  Car_Order (Fill (Key)) := K;
                  Fill (Key) := Fill (Key) + 1;
               end if;
            end;
         end loop;
      end;
   end Place_Cars;

   ---------------------------------------------------------------------
   --  The minute
   ---------------------------------------------------------------------

   procedure Open_Week (S : Population_State; C : Hood.City.City_State) is
      pragma Unreferenced (C);
   begin
      Place_Cars (S.Week, S.Minute);
      Scans (1 - Fresh_Ix).N_Cross := 0;
      Scans (1 - Fresh_Ix).N_Drivers := 0;
      for I in 0 .. S.Count - 1 loop
         Add_Person (Scans (1 - Fresh_Ix), S, I);
      end loop;
      Scans (Fresh_Ix).N_Cross := 0;
      Scans (Fresh_Ix).N_Drivers := 0;
   end Open_Week;

   procedure Begin_Scan is
   begin
      Scans (Fresh_Ix).N_Cross := 0;
      Scans (Fresh_Ix).N_Drivers := 0;
   end Begin_Scan;

   procedure Scan_Person (S : Population_State; I : Integer_32) is
   begin
      Add_Person (Scans (Fresh_Ix), S, I);
   end Scan_Person;

   type Street_Item is record
      S, Across : Long_Float;
      Key : Integer_32;
   end record;

   procedure Tick (S : Population_State; C : Hood.City.City_State) is
      pragma Unreferenced (C);
   begin
      for K in 0 .. N_Cars - 1 loop
         if Halted (K) then
            Delay_M (K) := Delay_M (K) + 1;
            Waited (K) := Waited (K) + 1;
         else
            Waited (K) := 0;
         end if;
         Halted (K) := False;
      end loop;
      Place_Cars (S.Week, S.Minute);
      Fresh_Ix := 1 - Fresh_Ix;
      Scans (Fresh_Ix).N_Cross := 0;
      Scans (Fresh_Ix).N_Drivers := 0;

      --  Walkers on a crossing in front.
      if Scans (1 - Fresh_Ix).N_Cross > 0 then
         for K in 0 .. N_Cars - 1 loop
            declare
               Cr : Car_Rec renames Cars (K);
               Key : constant Integer_32 := Street_Key (Cr.Axis_X, Cr.Line);
               In_Junction : constant Boolean :=
                 abs (Cr.S - Round (Cr.S / Cell) * Cell) < Give_Way_Inside;
               Limit : constant Long_Float := (if In_Junction then 3.0 else Braking);
            begin
               for X in 1 .. Scans (1 - Fresh_Ix).N_Cross loop
                  if Street_Key (Scans (1 - Fresh_Ix).Crossings (X).Axis_X, Scans (1 - Fresh_Ix).Crossings (X).Line) = Key then
                     declare
                        Gap : constant Long_Float :=
                          (Scans (1 - Fresh_Ix).Crossings (X).S - Cr.S) * Long_Float (Cr.Dir);
                     begin
                        if Gap > -2.0 and then Gap < Limit then
                           Halted (K) := True;
                           exit;
                        end if;
                     end;
                  end if;
               end loop;
            end;
         end loop;
      end if;

      --  Gang cars in the road ahead.
      if Scans (1 - Fresh_Ix).N_Drivers > 0 then
         declare
            Items : array (1 .. 2 * Max_Drivers) of Street_Item;
            NI : Integer := 0;
         begin
            for D in 1 .. Scans (1 - Fresh_Ix).N_Drivers loop
               declare
                  P : Person_Rec renames S.People (Scans (1 - Fresh_Ix).Drivers (D));
                  Row : constant Integer_32 := Round_Int (P.Y / Cell);
                  Col : constant Integer_32 := Round_Int (P.X / Cell);
               begin
                  if abs (P.Y - Long_Float (Row) * Cell) < Street_Half then
                     NI := NI + 1;
                     Items (NI) := (S => P.X, Across => P.Y, Key => Street_Key (True, Row));
                  end if;
                  if abs (P.X - Long_Float (Col) * Cell) < Street_Half then
                     NI := NI + 1;
                     Items (NI) := (S => P.Y, Across => P.X, Key => Street_Key (False, Col));
                  end if;
               end;
            end loop;
            for K in 0 .. N_Cars - 1 loop
               if not Halted (K) then
                  declare
                     Cr : Car_Rec renames Cars (K);
                     Key : constant Integer_32 := Street_Key (Cr.Axis_X, Cr.Line);
                  begin
                     for O in 1 .. NI loop
                        if Items (O).Key = Key
                          and then abs (Items (O).Across - (if Cr.Axis_X then Cr.Y else Cr.X)) < Body_In_Lane
                        then
                           declare
                              Gap : constant Long_Float := (Items (O).S - Cr.S) * Long_Float (Cr.Dir);
                           begin
                              if Gap > 0.0 and then Gap < Speed + Follow_Gap then
                                 Halted (K) := True;
                                 exit;
                              end if;
                           end;
                        end if;
                     end loop;
                  end;
               end if;
            end loop;
         end;
      end if;

      --  Into a junction one at a time.
      declare
         function Nearing (K : Integer_32) return Boolean is
           (not Halted (K) and then Cars (K).Has_J
            and then Cars (K).Ahead <= Speed + 2.0
            and then Hypot (Cars (K).X - Cars (K).JX, Cars (K).Y - Cars (K).JY) >= Junction_Box);
         function Same_J (A, B : Integer_32) return Boolean is
           (Cars (A).JX = Cars (B).JX and then Cars (A).JY = Cars (B).JY);
         First : Int_Cars;  --  per car: the car first into its junction
      begin
         for K in 0 .. N_Cars - 1 loop
            First (K) := -1;
         end loop;
         --  entering: per junction, the nearest nearing car (the lowest
         --  number on a tie). Kept per car by looking back.
         for K in 0 .. N_Cars - 1 loop
            if Nearing (K) then
               declare
                  Best : Integer_32 := K;
               begin
                  for M in 0 .. N_Cars - 1 loop
                     if M /= K and then Nearing (M) and then Same_J (M, K) then
                        if Cars (M).Ahead < Cars (Best).Ahead
                          or else (Cars (M).Ahead = Cars (Best).Ahead and then M < Best)
                        then
                           Best := M;
                        end if;
                     end if;
                  end loop;
                  First (K) := Best;
               end;
            end if;
         end loop;
         for K in 0 .. N_Cars - 1 loop
            if Nearing (K) and then Waited (K) <= 30 then
               if First (K) /= K then
                  Halted (K) := True;
               else
                  declare
                     Cr : Car_Rec renames Cars (K);
                     Exit_Axis_X : constant Boolean := Cr.Exit_H mod 2 = 0;
                     Exit_Dir : constant Long_Float := (if Cr.Exit_H < 2 then 1.0 else -1.0);
                     Exit_Line : constant Integer_32 :=
                       Round_Int ((if Exit_Axis_X then Cr.JY else Cr.JX) / Cell);
                     function Busy (X, Y : Long_Float) return Boolean is
                       (abs (X - Cr.JX) < Junction_Box and then abs (Y - Cr.JY) < Junction_Box);
                     Held : Boolean := False;
                  begin
                     for D in 1 .. Scans (1 - Fresh_Ix).N_Drivers loop
                        if Busy (S.People (Scans (1 - Fresh_Ix).Drivers (D)).X, S.People (Scans (1 - Fresh_Ix).Drivers (D)).Y) then
                           Held := True;
                        end if;
                     end loop;
                     for M in 0 .. N_Cars - 1 loop
                        exit when Held;
                        if M /= K then
                           declare
                              O : Car_Rec renames Cars (M);
                           begin
                              if Busy (O.X, O.Y) then
                                 Held := True;
                              elsif O.Axis_X = Exit_Axis_X and then O.Line = Exit_Line
                                and then Long_Float (O.Dir) = Exit_Dir
                              then
                                 declare
                                    Along : constant Long_Float :=
                                      (O.S - (if Exit_Axis_X then Cr.JX else Cr.JY)) * Exit_Dir;
                                 begin
                                    if Along > 0.0 and then Along < Follow_Gap + Speed then
                                       Held := True;
                                    end if;
                                 end;
                              end if;
                           end;
                        end if;
                     end loop;
                     if Held then
                        Halted (K) := True;
                     end if;
                  end;
               end if;
            end if;
         end loop;
      end;

      --  Queues: behind a stopped car in the same lane.
      declare
         function Lane_Key (K : Integer_32) return Integer_32 is
           (Street_Key (Cars (K).Axis_X, Cars (K).Line) * 2 + (if Cars (K).Dir > 0 then 1 else 0));
         Done : Bool_Cars := [others => False];
         Lane : Int_Cars;
         N : Integer_32;
      begin
         for K0 in 0 .. N_Cars - 1 loop
            if not Done (K0) then
               N := 0;
               for K in K0 .. N_Cars - 1 loop
                  if not Done (K) and then Lane_Key (K) = Lane_Key (K0) then
                     Lane (N) := K;
                     N := N + 1;
                     Done (K) := True;
                  end if;
               end loop;
               if N >= 2 then
                  declare
                     Changed : Boolean := True;
                     Guard : Integer_32 := 0;
                  begin
                     while Changed and then Guard < N loop
                        Changed := False;
                        for FI in 0 .. N - 1 loop
                           declare
                              F : constant Integer_32 := Lane (FI);
                           begin
                              if not Halted (F) then
                                 for LI in 0 .. N - 1 loop
                                    declare
                                       L : constant Integer_32 := Lane (LI);
                                    begin
                                       if L /= F and then Halted (L) then
                                          declare
                                             Gap : constant Long_Float :=
                                               (Cars (L).S - Cars (F).S) * Long_Float (Cars (F).Dir);
                                          begin
                                             if Gap > 0.0 and then Gap < Speed + Follow_Gap then
                                                Halted (F) := True;
                                                Changed := True;
                                                exit;
                                             end if;
                                          end;
                                       end if;
                                    end;
                                 end loop;
                              end if;
                           end;
                        end loop;
                        Guard := Guard + 1;
                     end loop;
                  end;
               end if;
            end if;
         end loop;
      end;
   end Tick;

   ---------------------------------------------------------------------
   --  Kerbs and the road ahead
   ---------------------------------------------------------------------

   --  A gang car coming along the street to the crossing, or standing at
   --  it (traffic.ts:211-218).
   function Driver_Holds
     (S : Population_State; I : Integer_32; Axis_X : Boolean; Line : Integer_32;
      S0 : Long_Float) return Boolean
   is
      P : Person_Rec renames S.People (I);
      Off : constant Long_Float := S0 - (if Axis_X then P.X else P.Y);
      Head : Long_Float := 0.0;
   begin
      if abs ((if Axis_X then P.Y else P.X) - Long_Float (Line) * Cell) >= Street_Half + 3.0 then
         return False;
      end if;
      if abs Off >= Driver_Radius then
         return False;
      end if;
      if P.Path_Len > 0 then
         declare
            N : constant Walk.Point := Walk.Point_Of (S, I, 0);
         begin
            Head := (if Axis_X then N.X - P.X else N.Y - P.Y);
         end;
      end if;
      return abs Off < 3.0 or else (Head /= 0.0 and then Sign (Head) = Sign (Off));
   end Driver_Holds;

   function Crossing_Blocked
     (S : Population_State; Axis_X : Boolean; Line : Integer_32; S0 : Long_Float) return Boolean
   is
      Key : constant Integer_32 := Street_Key (Axis_X, Line);
   begin
      if Valid_Key (Key) then
         for J in Car_Start (Key) .. Car_Start (Key + 1) - 1 loop
            declare
               K : constant Integer_32 := Car_Order (J);
            begin
               if not (Halted (K) and then Waited (K) = 0) then
                  declare
                     Gap : constant Long_Float := (S0 - Cars (K).S) * Long_Float (Cars (K).Dir);
                  begin
                     if Gap > Car_Clearance and then Gap < Speed * Walker_Lead + Car_Margin then
                        return True;
                     end if;
                  end;
               end if;
            end;
         end loop;
      end if;
      for D in 1 .. Scans (1 - Fresh_Ix).N_Drivers loop
         if Driver_Holds (S, Scans (1 - Fresh_Ix).Drivers (D), Axis_X, Line, S0) then
            return True;
         end if;
      end loop;
      return False;
   end Crossing_Blocked;

   function Crossing_Has_Traffic
     (S : Population_State; AX, AY, NX, NY : Long_Float) return Boolean is
      MX : constant Long_Float := (AX + NX) / 2.0;
      MY : constant Long_Float := (AY + NY) / 2.0;
   begin
      if abs (NX - AX) >= abs (NY - AY) then
         return Crossing_Blocked (S, False, Round_Int (MX / Cell), MY);
      else
         return Crossing_Blocked (S, True, Round_Int (MY / Cell), MX);
      end if;
   end Crossing_Has_Traffic;

   function Road_Ahead_Blocked (AX, AY, NX, NY : Long_Float) return Boolean is
      HXd : constant Long_Float := NX - AX;
      HYd : constant Long_Float := NY - AY;
      Len : Long_Float;
      UX, UY : Long_Float;
      Driving_Along_X : Boolean;
   begin
      if Scans (1 - Fresh_Ix).N_Cross = 0 then
         return False;
      end if;
      Len := Hypot (HXd, HYd);
      if Len < 0.5 then
         return False;
      end if;
      UX := HXd / Len;
      UY := HYd / Len;
      Driving_Along_X := abs UX >= abs UY;
      for I in 1 .. Scans (1 - Fresh_Ix).N_Cross loop
         declare
            X : Crossing_Rec renames Scans (1 - Fresh_Ix).Crossings (I);
         begin
            if X.Axis_X = Driving_Along_X then
               declare
                  DX : constant Long_Float := X.WX - AX;
                  DY : constant Long_Float := X.WY - AY;
                  Along : constant Long_Float := DX * UX + DY * UY;
                  Across : constant Long_Float := abs (DX * UY - DY * UX);
               begin
                  if Along > -2.0 and then Along < Braking and then Across < In_The_Way then
                     return True;
                  end if;
               end;
            end if;
         end;
      end loop;
      return False;
   end Road_Ahead_Blocked;

   function Road_Ahead_Room
     (S : Population_State; Self : Integer_32;
      AX, AY, NX, NY : Long_Float; Has_After : Boolean; FX, FY : Long_Float)
      return Long_Float
   is
      HXd : constant Long_Float := NX - AX;
      HYd : constant Long_Float := NY - AY;
      Along_X : Boolean;
      Dir : Long_Float;
      Line : Integer_32;
      Turns_There : Boolean;
      Reach : Long_Float;
      Room : Long_Float := Infinity;
      Used_Scan : Scan_Rec renames Scans (1 - Fresh_Ix);
   begin
      if S.Phase /= Week_Running then
         return Infinity;
      end if;
      if abs HXd < 0.5 and then abs HYd < 0.5 then
         return Infinity;
      end if;
      Along_X := abs HXd >= abs HYd;
      Dir := Sign (if Along_X then HXd else HYd);
      Line := Round_Int ((if Along_X then AY else AX) / Cell);
      Turns_There := Has_After and then
        (if Along_X then abs (FY - NY) > 0.5 else abs (FX - NX) > 0.5);
      Reach := (if Turns_There then Hypot (HXd, HYd) + 1.0 else Infinity);
      declare
         Key : constant Integer_32 := Street_Key (Along_X, Line);
      begin
         if Valid_Key (Key) then
            for J in Car_Start (Key) .. Car_Start (Key + 1) - 1 loop
               declare
                  C : Car_Rec renames Cars (Car_Order (J));
                  K : constant Integer_32 := Car_Order (J);
               begin
                  if Long_Float (C.Dir) = Dir
                    and then abs (if Along_X then C.Y - AY else C.X - AX) < Same_Lane
                  then
                     declare
                        Along : constant Long_Float := (if Along_X then C.X - AX else C.Y - AY) * Dir;
                     begin
                        if not (Along <= 0.0 or else Along > Reach) then
                           Room := Min (Room, Along + (if Halted (K) then 0.0 else Speed) - Follow_Gap);
                        end if;
                     end;
                  end if;
               end;
            end loop;
         end if;
      end;
      for DI in 1 .. Used_Scan.N_Drivers loop
         declare
            I : constant Integer_32 := Used_Scan.Drivers (DI);
            P : Person_Rec renames S.People (I);
         begin
            if I /= Self and then P.Path_Len > 0
              and then abs (if Along_X then P.Y - AY else P.X - AX) < Same_Lane
            then
               declare
                  Along : constant Long_Float := (if Along_X then P.X - AX else P.Y - AY) * Dir;
                  N : constant Walk.Point := Walk.Point_Of (S, I, 0);
               begin
                  if not (Along <= -0.5 or else Along > Min (Reach, Give_Way_Look + Follow_Gap))
                    and then not ((if Along_X then N.X - P.X else N.Y - P.Y) * Dir < -0.5)
                  then
                     if Along < 0.5 then
                        if P.Id < S.People (Self).Id then
                           Room := 0.0;
                        end if;
                     else
                        Room := Min (Room, Along - Follow_Gap);
                     end if;
                  end if;
               end;
            end if;
         end;
      end loop;
      declare
         A : constant Long_Float := (if Along_X then AX else AY);
         B : constant Long_Float := (if Along_X then NX else NY);
         Node : constant Long_Float :=
           (if Dir > 0.0 then Ceil ((A + Give_Way_Inside) / Cell)
            else Floor ((A - Give_Way_Inside) / Cell)) * Cell;
         To_Junction : constant Long_Float := (Node - A) * Dir;
         Junction_Ahead : constant Boolean :=
           To_Junction <= (B - A) * Dir + Junction and then To_Junction < Give_Way_Look;
      begin
         if Junction_Ahead and then Room < Infinity and then Room > To_Junction - Give_Way_Line
           and then Room < To_Junction + Clear_Past
         then
            Room := To_Junction - Give_Way_Line;
         end if;
         if Junction_Ahead and then Has_After and then To_Junction > Give_Way_Inside
           and then Road_Ahead_Blocked (NX, NY, FX, FY)
         then
            Room := Min (Room, To_Junction - Give_Way_Line);
         end if;
         if Junction_Ahead then
            declare
               Cross : constant Integer_32 := Street_Key (not Along_X, Round_Int (Node / Cell));
               S0 : constant Long_Float := Long_Float (Line) * Cell;
               Side : constant Long_Float := Sign ((if Along_X then AY else AX) - Long_Float (Line) * Cell);
               Swing : constant Long_Float :=
                 (if Has_After then Sign (if Along_X then FY - NY else FX - NX) else 0.0);
               Kerb_Turn : constant Boolean :=
                 abs (B - Node) < Junction and then Swing /= 0.0 and then Swing = Side;
               Turning : constant Boolean :=
                 abs (B - Node) < Junction and then Swing /= 0.0 and then Swing = -Side;
            begin
               if Valid_Key (Cross) then
                  for J in Car_Start (Cross) .. Car_Start (Cross + 1) - 1 loop
                     declare
                        K : constant Integer_32 := Car_Order (J);
                        C : Car_Rec renames Cars (K);
                        Gap : constant Long_Float := (S0 - C.S) * Long_Float (C.Dir);
                     begin
                        if not (Kerb_Turn and then Long_Float (C.Dir) /= Swing) then
                           if (if Halted (K) then Gap > -Clear_Past and then Gap < Junction
                               else Gap > -Clear_Past and then Gap < Speed + Give_Way_Line)
                           then
                              Room := Min (Room, To_Junction - Give_Way_Line);
                              exit;
                           end if;
                        end if;
                     end;
                  end loop;
               end if;
               if Turning then
                  declare
                     Key : constant Integer_32 := Street_Key (Along_X, Line);
                  begin
                     if Valid_Key (Key) then
                        for J in Car_Start (Key) .. Car_Start (Key + 1) - 1 loop
                           declare
                              C : Car_Rec renames Cars (Car_Order (J));
                           begin
                              if Long_Float (C.Dir) /= Dir and then abs (Node - C.S) < Junction then
                                 Room := Min (Room, To_Junction - Give_Way_Line);
                                 exit;
                              end if;
                           end;
                        end loop;
                     end if;
                  end;
               end if;
            end;
         end if;
      end;
      return Max (0.0, Room);
   end Road_Ahead_Room;

   function Car_Count return Integer_32 is (N_Cars);
   function Car_X (K : Integer_32) return Long_Float is (Cars (K).X);
   function Car_Y (K : Integer_32) return Long_Float is (Cars (K).Y);
   function Car_Head (K : Integer_32) return Integer_32 is (Cars (K).Head);
   function Car_Truck (K : Integer_32) return Boolean is (Specs (K).Truck);
   function Car_Colour (K : Integer_32) return Integer_32 is (Specs (K).Colour);
   function Car_Halted (K : Integer_32) return Boolean is (Halted (K));

   function Traffic_Hash return Unsigned_32 is
      H : Unsigned_32 := 2_166_136_261;
      procedure Add (V : Unsigned_32) is
      begin
         for B in 0 .. 3 loop
            H := (H xor (Shift_Right (V, 8 * B) and 255)) * 16_777_619;
         end loop;
      end Add;
   begin
      for K in 0 .. N_Cars - 1 loop
         Add (Unsigned_32 (Delay_M (K)));
         Add ((if Halted (K) then 1 else 0));
      end loop;
      return H;
   end Traffic_Hash;

   function Crossings_In_Use return Integer_32 is (Scans (1 - Fresh_Ix).N_Cross);

   function Halted_Count return Integer_32 is
      N : Integer_32 := 0;
   begin
      for K in 0 .. N_Cars - 1 loop
         if Halted (K) then
            N := N + 1;
         end if;
      end loop;
      return N;
   end Halted_Count;

end Hood.Population.Traffic;
