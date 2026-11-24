with Hood.Floats;
with Hood.Population.Walk;
with Hood.Population.Roads;

package body Hood.Population.Transport is

   --  The capacity check below raises; in the wasm build that reaches the last-chance
   --  handler, which reports the file and line to the page.
   pragma Warnings (Off, "pragma Restrictions (No_Exception_Propagation)");
   pragma Warnings (Off, "Last_Chance_Handler will be called");

   use Hood.Floats;

   function Crew_Cars (S : Population_State; Slot : Integer_32; K : Vehicle_Kind) return Integer_32 is
     (case K is
         when V_Speedster => S.Crews (Slot).Speedsters,
         when V_Coupe     => S.Crews (Slot).Coupes,
         when V_Truck     => S.Crews (Slot).Trucks);

   function Driving (S : Population_State; P : Integer_32) return Long_Float is
     (Long_Float (S.People (P).Skills (Hood.Tables.Driving)) / 2.0);

   function Dist (AX, AY, BX, BY : Long_Float) return Long_Float is
      DX : constant Long_Float := AX - BX;
      DY : constant Long_Float := AY - BY;
   begin
      return Sqrt (DX * DX + DY * DY);
   end Dist;

   procedure Base
     (S : Population_State; C : Hood.City.City_State; G : Gang_Ref;
      NX, NY : Long_Float; X, Y : out Long_Float)
   is
      Found : Boolean := False;
      Best_D, D, DX, DY : Long_Float := 0.0;
   begin
      X := NX;
      Y := NY;
      if G = 0 then
         return;
      end if;
      for B in Integer_32 range 0 .. C.Building_Count - 1 loop
         if Live (C, B) and then C.Buildings (B).Kind_Of = T_Office
           and then S.Extra (B).Owner_Gang = G
         then
            Walk.Door (S, C, B, DX, DY);
            D := Dist (DX, DY, NX, NY);
            if not Found or else D < Best_D then
               Found := True;
               Best_D := D;
               X := DX;
               Y := DY;
            end if;
         end if;
      end loop;
   end Base;

   function Find (S : Population_State; Slot : Integer_32; K : Vehicle_Kind; N : Integer_32)
     return Integer_32 is
   begin
      for V in 0 .. S.Fleet_Count - 1 loop
         if S.Fleet (V).Used and then S.Fleet (V).Crew = Slot and then S.Fleet (V).Kind = K
           and then S.Fleet (V).Slot = N
         then
            return V;
         end if;
      end loop;
      return No_Id;
   end Find;

   function Busy (S : Population_State; V : Integer_32) return Boolean is
     (V /= No_Id and then (S.Fleet (V).Order /= No_Id or else S.Fleet (V).Occ_Count > 0));

   --  transport.ts walkLength: along his own footway route.
   function Walk_Length
     (C : Hood.City.City_State; FX, FY, TX, TY : Long_Float; Id : Integer_32) return Long_Float
     renames Walk.Walk_Length;

   procedure Crew_Plan
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      People : People_List; N : Integer_32;
      Has_From : Boolean; FX, FY : Long_Float;
      Has_To : Boolean; TX, TY : Long_Float;
      Result : out Plan)
   is
      type Free_Rec is record
         Kind : Vehicle_Kind;
         Slot : Integer_32;
         Has_Spot : Boolean;
         X, Y : Long_Float;
         Key  : Long_Float;
      end record;
      Free : array (1 .. Max_Plan_Cars) of Free_Rec;
      NF : Integer := 0;
      Remaining : People_List := People;
      NR : Integer_32 := N;
      Has_From0 : Boolean;
      F0X, F0Y : Long_Float := 0.0;
   begin
      Result.Car_Count := 0;
      Result.Walker_Count := 0;
      for K in Vehicle_Kind loop  --  speedster, coupe, truck
         for Sl in 0 .. Crew_Cars (S, Slot, K) - 1 loop
            declare
               V : constant Integer_32 := Find (S, Slot, K, Sl);
               R : Free_Rec := (K, Sl, False, 0.0, 0.0, 0.0);
            begin
               if not Busy (S, V) and then NF < Max_Plan_Cars then
                  if V /= No_Id then
                     R.Has_Spot := True;
                     R.X := S.Fleet (V).X;
                     R.Y := S.Fleet (V).Y;
                  elsif Has_To then
                     R.Has_Spot := True;
                     Base (S, C, S.Crews (Slot).Gang, TX, TY, R.X, R.Y);
                  end if;
                  NF := NF + 1;
                  Free (NF) := R;
               end if;
            end;
         end loop;
      end loop;
      Has_From0 := Has_From or else NR > 0;
      if Has_From then
         F0X := FX;
         F0Y := FY;
      elsif NR > 0 then
         F0X := S.People (Remaining (1)).X;
         F0Y := S.People (Remaining (1)).Y;
      end if;
      if Has_From0 then
         for I in 1 .. NF loop
            Free (I).Key := (if Free (I).Has_Spot then Dist (Free (I).X, Free (I).Y, F0X, F0Y) else 0.0);
         end loop;
         --  A stable sort by the distance from the first man.
         for I in 2 .. NF loop
            declare
               V : constant Free_Rec := Free (I);
               J : Integer := I - 1;
            begin
               while J >= 1 and then Free (J).Key > V.Key loop
                  Free (J + 1) := Free (J);
                  J := J - 1;
               end loop;
               Free (J + 1) := V;
            end;
         end loop;
      end if;
      for I in 1 .. NF loop
         exit when NR = 0;
         declare
            F : Free_Rec renames Free (I);
            Riders : Rider_List := [others => No_Id];
            Taken : Integer_32 := 0;
            Walk_Max : Long_Float := 0.0;
            Keep : People_List := [others => No_Id];
            NK : Integer_32 := 0;
         begin
            for R in 1 .. Integer (NR) loop
               declare
                  P : constant Integer_32 := Remaining (R);
                  PX : constant Long_Float := (if Has_From then FX else S.People (P).X);
                  PY : constant Long_Float := (if Has_From then FY else S.People (P).Y);
                  To_Car : Long_Float := 0.0;
                  Ok : Boolean;
               begin
                  if F.Has_Spot and then Dist (PX, PY, F.X, F.Y) > 8.0 then
                     To_Car := Walk_Length (C, PX, PY, F.X, F.Y, S.People (P).Id);
                  end if;
                  if not F.Has_Spot then
                     Ok := True;
                  elsif Has_To then
                     --  quickerByCar
                     if Dist (PX, PY, TX, TY) <= Drive_Min_Distance then
                        Ok := False;
                     elsif Dist (PX, PY, F.X, F.Y) <= 8.0 then
                        Ok := True;
                     else
                        declare
                           Drive : constant Long_Float :=
                             Drive_Speed * Pace (F.Kind) * (0.75 + Driving (S, P) * 0.1);
                        begin
                           Ok := To_Car / Walk_Speed + Dist (F.X, F.Y, TX, TY) / Drive
                             < Walk_Length (C, PX, PY, TX, TY, S.People (P).Id) / Walk_Speed;
                        end;
                     end if;
                  else
                     Ok := Dist (F.X, F.Y, PX, PY) <= Drive_Min_Distance;
                  end if;
                  if Ok and then Taken < Seats (F.Kind) then
                     Taken := Taken + 1;
                     Riders (Integer (Taken)) := P;
                     Walk_Max := Max (Walk_Max, To_Car);
                  else
                     NK := NK + 1;
                     Keep (Integer (NK)) := P;
                  end if;
               end;
            end loop;
            if Taken > 0 then
               Remaining := Keep;
               NR := NK;
               Result.Car_Count := Result.Car_Count + 1;
               Result.Cars (Integer (Result.Car_Count)) :=
                 (Kind => F.Kind, Slot => F.Slot, Count => Taken, Riders => Riders, Walk => Walk_Max);
            end if;
         end;
      end loop;
      Result.Walker_Count := NR;
      Result.Walkers := Remaining;
   end Crew_Plan;

   procedure Planned_Travel
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      People : People_List; N : Integer_32;
      Has_From : Boolean; FX, FY : Long_Float;
      Has_To : Boolean; TX, TY : Long_Float;
      Speed, Walk_Minutes : out Long_Float)
   is
      P : Plan;
      Walk : Long_Float := 0.0;
   begin
      Crew_Plan (S, C, Slot, People, N, Has_From, FX, FY, Has_To, TX, TY, P);
      Speed := Infinity;
      for K in 1 .. Integer (P.Car_Count) loop
         declare
            Best : Long_Float := -Infinity;
         begin
            for R in 1 .. Integer (P.Cars (K).Count) loop
               Best := Max (Best, Driving (S, P.Cars (K).Riders (R)));
            end loop;
            Speed := Min (Speed, Drive_Speed * Pace (P.Cars (K).Kind) * (0.75 + Best * 0.1));
         end;
         Walk := Max (Walk, P.Cars (K).Walk);
      end loop;
      if P.Walker_Count > 0 or else P.Car_Count = 0 then
         Speed := Min (Speed, Walk_Speed);
      end if;
      Walk_Minutes := Walk / Walk_Speed;
   end Planned_Travel;

   Boardings : Integer_32 := 0;
   function Sync_Count return Integer_32 is (Boardings);

   function Now (S : Population_State) return Integer_32 is
     (S.Week * Minutes_Per_Week + S.Minute);

   function Pid (S : Population_State; I : Integer_32) return Integer_32 is (S.People (I).Id);

   --  parkedSpots: where the gang's other cars stand, or will stand.
   Spot_X, Spot_Y : Walk.Coord_List;
   procedure Parked_Spots (S : Population_State; Except : Integer_32; N : out Integer_32) is
   begin
      N := 0;
      for V in 0 .. S.Fleet_Count - 1 loop
         if V /= Except then
            declare
               F : Vehicle_Rec renames S.Fleet (V);
            begin
               if F.Driver /= No_Id and then S.People (F.Driver).In_Vehicle
                 and then S.People (F.Driver).Walking
               then
                  Spot_X (N) := S.People (F.Driver).DX;
                  Spot_Y (N) := S.People (F.Driver).DY;
               else
                  Spot_X (N) := F.X;
                  Spot_Y (N) := F.Y;
               end if;
               N := N + 1;
            end;
         end if;
      end loop;
   end Parked_Spots;

   function Best_Driver (S : Population_State; V : Integer_32) return Integer_32 is
      Best : Integer_32 := No_Id;
      F : Vehicle_Rec renames S.Fleet (V);
      P : Integer_32;
   begin
      for K in 1 .. Integer (F.Occ_Count) loop
         P := F.Occupants (K);
         if Best = No_Id
           or else S.People (P).Skills (Hood.Tables.Driving) > S.People (Best).Skills (Hood.Tables.Driving)
           or else (S.People (P).Skills (Hood.Tables.Driving) = S.People (Best).Skills (Hood.Tables.Driving)
                    and then Pid (S, P) < Pid (S, Best))
         then
            Best := P;
         end if;
      end loop;
      return Best;
   end Best_Driver;

   procedure Remove_Occupant (F : in out Vehicle_Rec; P : Integer_32) is
      N : Integer_32 := 0;
   begin
      for K in 1 .. Integer (F.Occ_Count) loop
         if F.Occupants (K) /= P then
            N := N + 1;
            F.Occupants (Integer (N)) := F.Occupants (K);
         end if;
      end loop;
      for K in Integer (N) + 1 .. Max_Occupants loop
         F.Occupants (K) := No_Id;
      end loop;
      F.Occ_Count := N;
   end Remove_Occupant;

   --  syncVehicle: the car is where its driver is; the others ride along.
   procedure Sync (S : in out Population_State; V : Integer_32) is
      F : Vehicle_Rec renames S.Fleet (V);
      D : constant Integer_32 := F.Driver;
   begin
      if D = No_Id or else not S.People (D).In_Vehicle then
         return;
      end if;
      F.X := S.People (D).X;
      F.Y := S.People (D).Y;
      for K in 1 .. Integer (F.Occ_Count) loop
         declare
            P : constant Integer_32 := F.Occupants (K);
         begin
            if P /= D and then S.People (P).In_Vehicle then
               S.People (P).X := S.People (D).X;
               S.People (P).Y := S.People (D).Y;
               S.People (P).Walking := S.People (D).Walking;
               S.People (P).DX := S.People (D).DX;
               S.People (P).DY := S.People (D).DY;
               S.People (P).Halted := S.People (D).Halted;
               declare
                  List : Walk.Point_List;
                  N : constant Integer_32 := S.People (D).Path_Len;
               begin
                  for J in 0 .. N - 1 loop
                     List (J) := Walk.Point_Of (S, D, J);
                  end loop;
                  Walk.Store_Route (S, P, List, N);
               end;
            end if;
         end;
      end loop;
   end Sync;

   procedure Set_Destination
     (S : in out Population_State; C : Hood.City.City_State; I : Integer_32; TX, TY : Long_Float)
   is
      V : constant Integer_32 := S.People (I).Vehicle;
   begin
      if S.People (I).In_Vehicle and then V /= No_Id and then S.Fleet (V).Driver /= I then
         Sync (S, V);
         return;
      end if;
      if not S.People (I).In_Vehicle then
         Walk.Set_Destination (S, C, I, TX, TY);
         return;
      end if;
      declare
         R : Roads.Route_Rec;
         N : Integer_32 := 0;
      begin
         if V /= No_Id then
            Parked_Spots (S, V, N);
         end if;
         Roads.Vehicle_Route
           (C, S.People (I).X, S.People (I).Y, TX, TY, S.People (I).Id mod 2 = 0, Spot_X, Spot_Y, N, R);
         S.People (I).X := R.Start_X;
         S.People (I).Y := R.Start_Y;
         S.People (I).DX := R.Dest_X;
         S.People (I).DY := R.Dest_Y;
         S.People (I).Walking := True;
         S.People (I).Halted := False;
         Walk.Store_Route (S, I, R.Path, R.Count);
         if V /= No_Id then
            S.Fleet (V).Has_Dest := True;
            S.Fleet (V).Dest_X := TX;
            S.Fleet (V).Dest_Y := TY;
            Sync (S, V);
         end if;
      end;
   end Set_Destination;

   procedure Add_No_Car (S : in out Population_State; Order, P : Integer_32) is
      O : Order_Rec renames S.Orders (Order);
   begin
      for K in 1 .. Integer (O.No_Car_Count) loop
         if O.No_Car (K) = P then
            return;
         end if;
      end loop;
      if O.No_Car_Count < O.No_Car'Length then
         O.No_Car_Count := O.No_Car_Count + 1;
         O.No_Car (Integer (O.No_Car_Count)) := P;
      end if;
   end Add_No_Car;

   function Near_Car (S : Population_State; F : Vehicle_Rec; P : Integer_32) return Boolean is
     (Dist (S.People (P).X, S.People (P).Y, F.X, F.Y) <= 3.0);

   --  tryBoard: everyone at the car gets in and it goes; after the wait,
   --  those still walking to it give up the seat.
   procedure Try_Board (S : in out Population_State; C : Hood.City.City_State; V : Integer_32) is
      F : Vehicle_Rec renames S.Fleet (V);
      T : constant Integer_32 := Now (S);
      All_Near : Boolean := True;
   begin
      if not F.Boarding or else F.Occ_Count = 0 then
         return;
      end if;
      if F.Board_Since < 0 then
         F.Board_Since := T;
      end if;
      for K in 1 .. Integer (F.Occ_Count) loop
         All_Near := All_Near and then Near_Car (S, F, F.Occupants (K));
      end loop;
      if not All_Near then
         if F.Order = No_Id or else T - F.Board_Since < Integer_32'Max (F.Board_Wait, 0) + Board_Wait_Minutes then
            return;
         end if;
         declare
            Near : Occupant_List := [others => No_Id];
            NN : Integer_32 := 0;
            P : Integer_32;
         begin
            for K in 1 .. Integer (F.Occ_Count) loop
               P := F.Occupants (K);
               if Near_Car (S, F, P) then
                  NN := NN + 1;
                  Near (Integer (NN)) := P;
               else
                  S.People (P).Vehicle := No_Id;
                  S.People (P).In_Vehicle := False;
                  if S.People (P).Order = F.Order and then F.Has_Dest then
                     Set_Destination (S, C, P, F.Dest_X, F.Dest_Y);
                  end if;
                  if S.People (P).Order = F.Order then
                     Add_No_Car (S, F.Order, P);
                  end if;
               end if;
            end loop;
            F.Occupants := Near;
            F.Occ_Count := NN;
            if NN = 0 then
               F.Boarding := False;
               F.Has_Dest := False;
               F.Order := No_Id;
               F.Driver := No_Id;
               F.Board_Since := -1;
               F.Board_Wait := -1;
               return;
            end if;
            F.Driver := Best_Driver (S, V);
         end;
      end if;
      F.Board_Since := -1;
      F.Board_Wait := -1;
      F.Boarding := False;
      Boardings := Boardings + 1;
      for K in 1 .. Integer (F.Occ_Count) loop
         declare
            P : constant Integer_32 := F.Occupants (K);
         begin
            S.People (P).In_Vehicle := True;
            S.People (P).X := F.X;
            S.People (P).Y := F.Y;
            Walk.Clear_Destination (S, P);
         end;
      end loop;
      if F.Has_Dest then
         Set_Destination (S, C, F.Driver, F.Dest_X, F.Dest_Y);
      end if;
      Sync (S, V);
   end Try_Board;

   procedure Reserve
     (S : in out Population_State; C : Hood.City.City_State; V : Integer_32;
      People : Occupant_List; N : Integer_32; TX, TY : Long_Float; Order : Integer_32)
   is
      F : Vehicle_Rec renames S.Fleet (V);
      Best : Integer_32 := People (1);
      Longest : Long_Float := 0.0;
   begin
      for K in 2 .. Integer (N) loop
         if not (S.People (Best).Skills (Hood.Tables.Driving) >= S.People (People (K)).Skills (Hood.Tables.Driving))
         then
            Best := People (K);
         end if;
      end loop;
      F.Occupants := People;
      F.Occ_Count := N;
      F.Driver := Best;
      F.Order := Order;
      F.Has_Dest := True;
      F.Dest_X := TX;
      F.Dest_Y := TY;
      F.Boarding := True;
      F.Returning := False;
      for K in 1 .. Integer (N) loop
         S.People (People (K)).Vehicle := V;
         S.People (People (K)).In_Vehicle := False;
         Walk.Set_Destination (S, C, People (K), F.X, F.Y);
      end loop;
      for K in 1 .. Integer (N) loop
         if Dist (S.People (People (K)).X, S.People (People (K)).Y, F.X, F.Y) <= 8.0 then
            S.People (People (K)).X := F.X;
            S.People (People (K)).Y := F.Y;
            Walk.Clear_Destination (S, People (K));
         end if;
      end loop;
      for K in 1 .. Integer (N) loop
         Longest := Max (Longest, Walk.Route_Length (S, People (K)));
      end loop;
      F.Board_Wait := Round_Int (Longest / Walk_Speed);
      Try_Board (S, C, V);
   end Reserve;

   --  makeVehicle: the crew's car of that kind and number, out of the
   --  garage onto a parking spot by the office nearest (NX, NY) if new.
   procedure Make_Vehicle
     (S : in out Population_State; C : Hood.City.City_State; Slot : Integer_32;
      K : Vehicle_Kind; N : Integer_32; NX, NY : Long_Float; V : out Integer_32)
   is
      BX, BY : Long_Float;
      NS : Integer_32;
   begin
      V := Find (S, Slot, K, N);
      if V /= No_Id then
         return;
      end if;
      if S.Fleet_Count >= Max_Vehicles then
         raise Program_Error;  --  fleet full (Max_Vehicles)
      end if;
      Base (S, C, S.Crews (Slot).Gang, NX, NY, BX, BY);
      Parked_Spots (S, No_Id, NS);
      V := S.Fleet_Count;
      S.Fleet_Count := S.Fleet_Count + 1;
      S.Fleet (V) :=
        (Used => True, Kind => K, Gang => S.Crews (Slot).Gang, Crew => Slot, Slot => N, Key_Order => V,
         X => 0.0, Y => 0.0, Driver => No_Id, Occ_Count => 0, Occupants => [others => No_Id],
         Order => No_Id, Has_Dest => False, Dest_X => 0.0, Dest_Y => 0.0, Boarding => False,
         Returning => False, Idle_Since => -1, Board_Since => -1, Board_Wait => -1);
      Roads.Parking_Spot (C, BX, BY, Spot_X, Spot_Y, NS, S.Fleet (V).X, S.Fleet (V).Y);
   end Make_Vehicle;

   procedure Reserve_Crew_Car
     (S : in out Population_State; C : Hood.City.City_State; Slot, Order : Integer_32;
      Car : Plan_Car; TX, TY : Long_Float)
   is
      V : Integer_32;
   begin
      Make_Vehicle (S, C, Slot, Car.Kind, Car.Slot, TX, TY, V);
      Reserve (S, C, V, Car.Riders, Car.Count, TX, TY, Order);
   end Reserve_Crew_Car;

   procedure Dismount (S : in out Population_State; I : Integer_32) is
      V : constant Integer_32 := S.People (I).Vehicle;
   begin
      if V /= No_Id then
         declare
            F : Vehicle_Rec renames S.Fleet (V);
         begin
            if F.Driver = I and then S.People (I).In_Vehicle then
               F.X := S.People (I).X;
               F.Y := S.People (I).Y;
            end if;
            Remove_Occupant (F, I);
            if F.Driver = I then
               F.Driver := Best_Driver (S, V);
            end if;
            if F.Occ_Count = 0 then
               F.Boarding := False;
               F.Has_Dest := False;
               F.Returning := False;
            end if;
         end;
      end if;
      S.People (I).Vehicle := No_Id;
      S.People (I).In_Vehicle := False;
   end Dismount;

   procedure Alight (S : in out Population_State; C : Hood.City.City_State; I : Integer_32) is
      Seated : constant Boolean := S.People (I).In_Vehicle;
   begin
      if S.People (I).Vehicle /= No_Id then
         Dismount (S, I);
      end if;
      if Seated and then Roads.On_Road (C, S.People (I).X, S.People (I).Y) then
         Roads.Pavement_Beside (C, S.People (I).X, S.People (I).Y);
      end if;
   end Alight;

   function Step_Person
     (S : in out Population_State; C : Hood.City.City_State; I : Integer_32;
      Traffic : Boolean) return Boolean
   is
      V : constant Integer_32 := S.People (I).Vehicle;
      Arrived : Boolean;
   begin
      if S.People (I).In_Vehicle and then V /= No_Id and then S.Fleet (V).Driver /= No_Id
        and then S.Fleet (V).Driver /= I
      then
         Sync (S, V);
         return not S.People (I).Walking;
      end if;
      Arrived := Walk.Step (S, C, I, Traffic);
      if V = No_Id then
         return Arrived;
      end if;
      --  afterTransportStep
      if S.Fleet (V).Boarding then
         Try_Board (S, C, V);
         return False;
      end if;
      if S.People (I).In_Vehicle then
         Sync (S, V);
         if Arrived and then S.Fleet (V).Returning then
            declare
               Riders : constant Occupant_List := S.Fleet (V).Occupants;
               N : constant Integer_32 := S.Fleet (V).Occ_Count;
            begin
               for K in 1 .. Integer (N) loop
                  Dismount (S, Riders (K));
               end loop;
            end;
         end if;
      end if;
      return Arrived;
   end Step_Person;

   procedure Release_Order (S : in out Population_State; Order : Integer_32) is
   begin
      for V in 0 .. S.Fleet_Count - 1 loop
         if S.Fleet (V).Order = Order then
            S.Fleet (V).Order := No_Id;
         end if;
      end loop;
   end Release_Order;

   function Stranded (S : Population_State; C : Hood.City.City_State; V : Integer_32) return Boolean is
      BX, BY : Long_Float;
   begin
      Base (S, C, S.Fleet (V).Gang, S.Fleet (V).X, S.Fleet (V).Y, BX, BY);
      return Dist (S.Fleet (V).X, S.Fleet (V).Y, BX, BY) > Stranded_Distance;
   end Stranded;

   --  freeCourier: the nearest free man of the car's crew.
   function Free_Courier (S : Population_State; V : Integer_32) return Integer_32 is
      F : Vehicle_Rec renames S.Fleet (V);
      Best : Integer_32 := No_Id;
      Best_D, D : Long_Float := 0.0;
      procedure Try (P : Integer_32) is
      begin
         if P = No_Id then
            return;
         end if;
         declare
            R : Person_Rec renames S.People (P);
         begin
            if R.Status = Active and then R.Gang = F.Gang and then R.Building = No_Id
              and then R.Order = No_Id and then not R.Walking and then R.Vehicle = No_Id
            then
               D := Dist (R.X, R.Y, F.X, F.Y);
               if Best = No_Id or else D < Best_D or else (D = Best_D and then R.Id < Pid (S, Best)) then
                  Best := P;
                  Best_D := D;
               end if;
            end if;
         end;
      end Try;
   begin
      if F.Crew = No_Id then
         return No_Id;
      end if;
      for K in 1 .. Integer (S.Crews (F.Crew).Count) loop
         Try (S.Crews (F.Crew).Members (K));
      end loop;
      Try (S.Crews (F.Crew).Lieutenant);
      return Best;
   end Free_Courier;

   function Order_Live (S : Population_State; O : Integer_32) return Boolean is
     (S.Orders (O).Gang /= 0
      and then S.Orders (O).State in Queued | Travelling | Executing | Waiting);

   procedure Reconcile (S : in out Population_State; C : Hood.City.City_State) is
   begin
      for V in 0 .. S.Fleet_Count - 1 loop
         declare
            Riders : constant Occupant_List := S.Fleet (V).Occupants;
            N : constant Integer_32 := S.Fleet (V).Occ_Count;
            P : Integer_32;
         begin
            for K in 1 .. Integer (N) loop
               P := Riders (K);
               if S.People (P).Status /= Active or else S.People (P).Gang /= S.Fleet (V).Gang
                 or else S.People (P).Vehicle /= V
                 or else (not S.Fleet (V).Boarding and then not S.People (P).In_Vehicle)
               then
                  if S.People (P).Vehicle = V then
                     Alight (S, C, P);
                  else
                     Remove_Occupant (S.Fleet (V), P);
                     if S.Fleet (V).Driver = P then
                        S.Fleet (V).Driver := Best_Driver (S, V);
                     end if;
                  end if;
               end if;
            end loop;
         end;
         if S.Fleet (V).Order /= No_Id and then not Order_Live (S, S.Fleet (V).Order) then
            S.Fleet (V).Order := No_Id;
         end if;
         if S.Fleet (V).Driver /= No_Id then
            Sync (S, V);
         end if;
         if S.Fleet (V).Crew /= No_Id and then not Busy (S, V) and then not S.Fleet (V).Boarding
           and then Stranded (S, C, V)
         then
            if S.Phase = Week_Running then
               declare
                  T : constant Integer_32 := Now (S);
                  Courier : Integer_32 := No_Id;
               begin
                  if S.Fleet (V).Idle_Since < 0 then
                     S.Fleet (V).Idle_Since := T;
                  end if;
                  if T - S.Fleet (V).Idle_Since >= Stranded_Minutes then
                     Courier := Free_Courier (S, V);
                  end if;
                  if Courier /= No_Id then
                     declare
                        BX, BY, PX, PY : Long_Float;
                        NS : Integer_32;
                     begin
                        S.Fleet (V).Idle_Since := -1;
                        Base (S, C, S.Fleet (V).Gang, S.Fleet (V).X, S.Fleet (V).Y, BX, BY);
                        Parked_Spots (S, V, NS);
                        Roads.Parking_Spot (C, BX, BY, Spot_X, Spot_Y, NS, PX, PY);
                        Reserve (S, C, V, [1 => Courier, others => No_Id], 1, PX, PY, No_Id);
                        S.Fleet (V).Returning := True;
                     end;
                  end if;
               end;
            end if;
         else
            S.Fleet (V).Idle_Since := -1;
         end if;
      end loop;
   end Reconcile;

   function No_Car (S : Population_State; Order, P : Integer_32) return Boolean is
   begin
      for K in 1 .. Integer (S.Orders (Order).No_Car_Count) loop
         if S.Orders (Order).No_Car (K) = P then
            return True;
         end if;
      end loop;
      return False;
   end No_Car;

   procedure Delete_Vehicle (S : in out Population_State; V : Integer_32) is
   begin
      for K in V .. S.Fleet_Count - 2 loop
         S.Fleet (K) := S.Fleet (K + 1);
      end loop;
      S.Fleet_Count := S.Fleet_Count - 1;
      S.Fleet (S.Fleet_Count).Used := False;
      for P in 0 .. S.Count - 1 loop
         if S.People (P).Vehicle = V then
            S.People (P).Vehicle := No_Id;
         elsif S.People (P).Vehicle > V then
            S.People (P).Vehicle := S.People (P).Vehicle - 1;
         end if;
      end loop;
   end Delete_Vehicle;

   procedure Reset_Week (S : in out Population_State; C : Hood.City.City_State) is
      V : Integer_32 := 0;
   begin
      for P in 0 .. S.Count - 1 loop
         if S.People (P).Vehicle /= No_Id then
            S.People (P).Vehicle := No_Id;
            S.People (P).In_Vehicle := False;
            Walk.Clear_Destination (S, P);
         end if;
      end loop;
      while V < S.Fleet_Count loop
         if S.Fleet (V).Crew /= No_Id and then Stranded (S, C, V) then
            S.Fleet (V).Occ_Count := 0;
            S.Fleet (V).Occupants := [others => No_Id];
            S.Fleet (V).Driver := No_Id;
            S.Fleet (V).Order := No_Id;
            S.Fleet (V).Has_Dest := False;
            S.Fleet (V).Boarding := False;
            S.Fleet (V).Returning := False;
            S.Fleet (V).Board_Since := -1;
            S.Fleet (V).Board_Wait := -1;
            V := V + 1;
         else
            Delete_Vehicle (S, V);
         end if;
      end loop;
   end Reset_Week;

   procedure Send_Home
     (S : in out Population_State; C : Hood.City.City_State; I : Integer_32; HX, HY : Long_Float)
   is
      V : constant Integer_32 := S.People (I).Vehicle;
   begin
      if V /= No_Id and then not S.People (I).In_Vehicle and then S.Fleet (V).Boarding then
         Try_Board (S, C, V);
      end if;
      if V /= No_Id and then S.People (I).In_Vehicle then
         declare
            D : constant Integer_32 := (if S.Fleet (V).Driver /= No_Id then S.Fleet (V).Driver else I);
            NS : Integer_32;
            PX, PY : Long_Float;
         begin
            S.Fleet (V).Returning := True;
            Parked_Spots (S, V, NS);
            Roads.Parking_Spot (C, HX, HY, Spot_X, Spot_Y, NS, PX, PY);
            Set_Destination (S, C, D, PX, PY);
         end;
      else
         if V /= No_Id then
            Dismount (S, I);
         end if;
         Set_Destination (S, C, I, HX, HY);
      end if;
   end Send_Home;

   procedure Drop_Crew (S : in out Population_State; Slot : Integer_32) is
      V : Integer_32 := 0;
   begin
      while V < S.Fleet_Count loop
         if S.Fleet (V).Crew = Slot then
            declare
               Riders : constant Occupant_List := S.Fleet (V).Occupants;
               N : constant Integer_32 := S.Fleet (V).Occ_Count;
            begin
               for K in 1 .. Integer (N) loop
                  Dismount (S, Riders (K));
               end loop;
            end;
            Delete_Vehicle (S, V);
         else
            V := V + 1;
         end if;
      end loop;
   end Drop_Crew;

end Hood.Population.Transport;
