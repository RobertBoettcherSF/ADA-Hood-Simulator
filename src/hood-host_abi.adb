with Hood.Population.Walk;
with Hood.Population.Transport;
with Hood.Population.Traffic;
with Hood.Trams;
with Hood.Floats;
with System.Storage_Elements;
with Hood.City;
with Hood.Grid;
with Hood.Population;
with Hood.Population.Commands;
with Hood.Population.Crews;
with Hood.Population.Orders;
with Hood.Random;
with Hood.Tables;
with Hood.Trig;
with Hood.Units;
with Hood.Version;
with Hood.World;

package body Hood.Host_ABI is

   Pending   : Error_Code := Error_Unexpected_State;
   File      : String (1 .. Max_File) := [others => ' '];
   File_Last : Natural := 0;

   function Build_Id return Integer_32 is (Hood.Version.Build_Id);

   World   : Hood.World.World_State;
   Started : Boolean := False;

   function State_Hash return Unsigned_32 is
     (if Started then Hood.World.Hash (World) else 0);

   function Clamp (V, Low, High : Integer_32) return Integer_32 is
     (Integer_32'Max (Low, Integer_32'Min (High, V)));

   Block_Layer : array (Integer_32 range 0 .. Hood.City.Max_Blocks * Block_Stride - 1)
     of Integer_32;
   Lot_Layer   : array (Integer_32 range 0 .. Hood.City.Max_Lots * Lot_Stride - 1)
     of Integer_32;

   People_Layer : array (Integer_32 range 0 .. Hood.Population.Max_People * People_Stride - 1)
     of Integer_32;

   function B2I (B : Boolean) return Integer_32 is (if B then 1 else 0);

   Car_Layer : array (Integer_32 range 0 .. 320 * Car_Stride - 1) of Integer_32 := [others => 0];
   Fleet_Layer : array (Integer_32 range 0 .. Hood.Population.Max_Vehicles * Fleet_Stride - 1) of Integer_32 :=
     [others => 0];
   Tram_Layer : array (Integer_32 range 0 .. Hood.Trams.Max_Trams * Tram_Stride - 1) of Integer_32 := [others => 0];
   Cars_N, Trams_N : Integer_32 := 0;
   Trams : Hood.Trams.Tram_List;

   --  Item 6: the traffic, the gang cars and the trams for the page.
   procedure Fill_Vehicles is
      S : Hood.Population.Population_State renames World.People;
      package T renames Hood.Population.Traffic;
      use type Hood.Population.Phase_Kind;
      K : Integer_32;
   begin
      Cars_N := (if S.Phase = Hood.Population.Week_Running then Integer_32'Min (T.Car_Count, 320) else 0);
      for I in 0 .. Cars_N - 1 loop
         K := I * Car_Stride;
         Car_Layer (K) := Hood.Floats.Units_Of (T.Car_X (I));
         Car_Layer (K + 1) := Hood.Floats.Units_Of (T.Car_Y (I));
         Car_Layer (K + 2) := T.Car_Head (I);
         Car_Layer (K + 3) := B2I (T.Car_Truck (I));
         Car_Layer (K + 4) := T.Car_Colour (I);
         Car_Layer (K + 5) := B2I (T.Car_Halted (I));
      end loop;
      for V in 0 .. S.Fleet_Count - 1 loop
         K := V * Fleet_Stride;
         declare
            F : Hood.Population.Vehicle_Rec renames S.Fleet (V);
            H : Integer_32 := -1;
         begin
            if F.Driver /= Hood.City.No_Id and then S.People (F.Driver).In_Vehicle
              and then S.People (F.Driver).Walking
            then
               declare
                  P : Hood.Population.Person_Rec renames S.People (F.Driver);
                  NX, NY : Long_Float;
               begin
                  if P.Path_Len > 0 then
                     NX := Hood.Population.Walk.Point_Of (S, F.Driver, 0).X;
                     NY := Hood.Population.Walk.Point_Of (S, F.Driver, 0).Y;
                  else
                     NX := P.DX;
                     NY := P.DY;
                  end if;
                  if abs (NX - P.X) >= abs (NY - P.Y) then
                     H := (if NX >= P.X then 0 else 2);
                  else
                     H := (if NY >= P.Y then 1 else 3);
                  end if;
               end;
            end if;
            Fleet_Layer (K) := Hood.Floats.Units_Of (F.X);
            Fleet_Layer (K + 1) := Hood.Floats.Units_Of (F.Y);
            Fleet_Layer (K + 2) := Hood.Population.Vehicle_Kind'Pos (F.Kind);
            Fleet_Layer (K + 3) := Integer_32 (F.Gang);
            Fleet_Layer (K + 4) := F.Crew;
            Fleet_Layer (K + 5) := F.Occ_Count;
            Fleet_Layer (K + 6) := H;
         end;
      end loop;
      Hood.Trams.At_Time (World.City, S.Week, Long_Float (S.Minute), Trams, Trams_N);
      for I in 0 .. Trams_N - 1 loop
         K := I * Tram_Stride;
         Tram_Layer (K) := Hood.Floats.Units_Of (Trams (I).X);
         Tram_Layer (K + 1) := Hood.Floats.Units_Of (Trams (I).Y);
         Tram_Layer (K + 2) := Hood.Floats.Units_Of (Trams (I).DX);
         Tram_Layer (K + 3) := Hood.Floats.Units_Of (Trams (I).DY);
         Tram_Layer (K + 4) := B2I (Trams (I).Visible);
         Tram_Layer (K + 5) := Trams (I).Line;
      end loop;
   end Fill_Vehicles;

   procedure Fill_People is
      S : Hood.Population.Population_State renames World.People;
      K : Integer_32;
   begin
      for I in 0 .. S.Count - 1 loop
         K := I * People_Stride;
         People_Layer (K) := Hood.Floats.Units_Of (S.People (I).X);
         People_Layer (K + 1) := Hood.Floats.Units_Of (S.People (I).Y);
         People_Layer (K + 2) := Hood.Tables.Role'Pos (S.People (I).Kind);
         People_Layer (K + 3) := Integer_32 (S.People (I).Gang);
         People_Layer (K + 4) :=
           (if S.People (I).In_Vehicle then 2
            else B2I (S.People (I).Building /= Hood.City.No_Id and then not S.People (I).Walking));
      end loop;
      Fill_Vehicles;
   end Fill_People;

   function Class_Of (T : Hood.Tables.Type_Id) return Integer_32 is
     (Hood.Tables.Building_Class'Pos (Hood.Tables.Type_Class (T)));

   procedure Fill_Layers is
      C : Hood.City.City_State renames World.City;
      K : Integer_32;
      T : Hood.Tables.Type_Id;
   begin
      for I in 0 .. C.Block_Count - 1 loop
         K := I * Block_Stride;
         declare
            B : Hood.City.Block_Rec renames C.Blocks (I);
         begin
            Block_Layer (K .. K + Block_Stride - 1) :=
              [B.GX, B.GY, Hood.Tables.District'Pos (B.Area),
               Hood.City.Block_Use'Pos (B.Use_Of), B.Span_X, B.Span_Y,
               B.Merged_Into, B.Land_Value, B.Squalor, B.Content,
               B2I (B.Rail), B.Landmark];
         end;
      end loop;
      for I in 0 .. C.Lot_Count - 1 loop
         K := I * Lot_Stride;
         declare
            L : Hood.City.Lot_Rec renames C.Lots (I);
         begin
            T := (if L.Building = Hood.City.No_Id then Hood.Tables.Empty_Land
                  else C.Buildings (L.Building).Kind_Of);
            Lot_Layer (K .. K + Lot_Stride - 1) :=
              [L.Block, L.Index, Integer_32 (L.X), Integer_32 (L.Y),
               Integer_32 (L.W), Integer_32 (L.H), Hood.Tables.Facing'Pos (L.Face),
               T, Class_Of (T), Hood.Tables.Type_Storeys (T)];
         end;
      end loop;
   end Fill_Layers;

   City_Version : Integer_32 := 0;

   --  The lot layer again after a building or block changed (an order).
   procedure Note_City is
   begin
      if World.People.City_Changed then
         World.People.City_Changed := False;
         City_Version := City_Version + 1;
         Fill_Layers;
      end if;
   end Note_City;

   function Player_Gang return Integer_32 is
   begin
      if Started then
         for G in Hood.Population.Gang_Id loop
            if World.People.Gangs (G).Player then
               return G;
            end if;
         end loop;
      end if;
      return 0;
   end Player_Gang;

   Staged       : Hood.Population.Orders.Order_Input := Hood.Population.Orders.No_Input;
   Preview      : Hood.Population.Order_Rec;
   Have_Preview : Boolean := False;
   Preview_Time : Boolean := False;
   Preview_Why  : Hood.Population.Line_Rec := Hood.Population.No_Line;
   Last_Reply   : Hood.Population.Commands.Reply := (Hood.Population.Commands.Y_None, 0, 0, 0, 0);
   Last_Kept    : Hood.Population.Target_List := [others => -1];
   Last_Kept_N  : Integer_32 := 0;
   Last_Slot    : Integer_32 := -1;

   function Line_Field (L : Hood.Population.Line_Rec; Field : Integer_32) return Integer_32 is
     (case Field is
         when 0 => Hood.Population.Line_Kind'Pos (L.Kind),
         when 1 => L.A, when 2 => L.B, when 3 => L.C, when 4 => L.D,
         when others => 0);

   function Order_Field (O : Hood.Population.Order_Rec; Field : Integer_32; Is_Preview : Boolean)
     return Integer_32
   is
      K : Integer_32;
   begin
      case Field is
         when F_O_Id        => return O.Id;
         when F_O_Gang      => return Integer_32 (O.Gang);
         when F_O_Crew      => return O.Crew;
         when F_O_Kind      => return Hood.Population.Order_Kind'Pos (O.Kind);
         when F_O_State     => return Hood.Population.Order_State'Pos (O.State);
         when F_O_Manpower  => return O.Manpower;
         when F_O_Repeat    => return B2I (O.Repeat);
         when F_O_Amount    => return O.Amount;
         when F_O_Level     => return O.Level;
         when F_O_Business  => return O.Business;
         when F_O_Front     => return O.Front;
         when F_O_PX        => return Integer_32 (O.PX);
         when F_O_PY        => return Integer_32 (O.PY);
         when F_O_Has_Point => return B2I (O.Has_Point);
         when F_O_Targets   => return O.Target_Count;
         when F_O_Blocks    => return O.Block_Count;
         when F_O_Assigned  => return O.Assigned_Count;
         when F_O_Cursor    => return O.Cursor;
         when F_O_Completed => return O.Completed;
         when F_O_Estimate  => return O.Estimate;
         when F_O_Worked    => return O.Worked;
         when F_O_Started   => return O.Started;
         when F_O_Finished  => return O.Finished;
         when F_O_Crew_Size => return O.Crew_Size;
         when F_O_Results   => return O.Result_Count;
         when F_O_Cost      =>
            return (if O.Gang = 0 then 0 else Hood.Population.Orders.Order_Cost (World.People, World.City, O));
         when F_O_Fail .. F_O_Fail + 4       => return Line_Field (O.Fail, Field - F_O_Fail);
         when F_O_Waiting .. F_O_Waiting + 4 => return Line_Field (O.Waiting_For, Field - F_O_Waiting);
         when F_O_Miss .. F_O_Miss + 4       => return Line_Field (O.Last_Miss, Field - F_O_Miss);
         when F_O_Has_Time  => return (if Is_Preview then B2I (Preview_Time) else 0);
         when F_O_Staffing .. F_O_Staffing + 3 =>
            return (if Is_Preview then Line_Field (Preview_Why, Field - F_O_Staffing) else 0);
         when F_O_Target .. F_O_Target + Hood.Population.Max_Targets - 1 =>
            K := Field - F_O_Target + 1;
            return (if K <= O.Target_Count then O.Targets (Integer (K)) else -1);
         when F_O_Block .. F_O_Block + Hood.Population.Max_Order_Blocks - 1 =>
            K := Field - F_O_Block + 1;
            return (if K <= O.Block_Count then O.Blocks (Integer (K)) else -1);
         when F_O_Person .. F_O_Person + 9 =>
            K := Field - F_O_Person + 1;
            return (if K <= O.Assigned_Count then O.Assigned (Integer (K)) else -1);
         when F_O_Result .. F_O_Result + 5 * Hood.Population.Max_Results - 1 =>
            K := (Field - F_O_Result) / 5 + 1;
            return (if K <= O.Result_Count
                    then Line_Field (O.Results (Integer (K)), (Field - F_O_Result) mod 5) else 0);
         when others => return 0;
      end case;
   end Order_Field;

   procedure New_Game
     (City_Seed, Auto_Seed : Unsigned_32; Blocks_X, Blocks_Y : Integer_32) is
   begin
      Hood.World.New_Game
        (World, City_Seed, Auto_Seed,
         Clamp (Blocks_X, Hood.Grid.Min_Blocks, Hood.Grid.Max_Blocks_X),
         Clamp (Blocks_Y, Hood.Grid.Min_Blocks, Hood.Grid.Max_Blocks_Y));
      Started := True;
      Fill_Layers;
      Fill_People;
      World.People.City_Changed := False;
      Have_Preview := False;
      Staged := Hood.Population.Orders.No_Input;
   end New_Game;

   procedure Launch_Week is
   begin
      if Started then
         Hood.World.Launch_Week (World);
      end if;
   end Launch_Week;

   function Tick (Minutes : Integer_32) return Integer_32 is
      Ran : Integer_32 := 0;
   begin
      if Started then
         Hood.World.Run_Minutes (World, Clamp (Minutes, 0, Hood.Population.Minutes_Per_Week), Ran);
         Fill_People;
         Note_City;
      end if;
      return Ran;
   end Tick;

   procedure Finish_Week is
   begin
      if Started then
         Hood.World.Finish_Week (World);
         Fill_People;
         Note_City;
      end if;
   end Finish_Week;

   function Name_Char (Person, Index : Integer_32) return Integer_32 is
   begin
      if not Started or else Person not in 0 .. World.People.Count - 1
        or else Index not in 1 .. Hood.Population.Full_Name_Length (World.People.People (Person))
      then
         return 0;
      end if;
      return Character'Pos (Hood.Population.Full_Name_Char (World.People.People (Person), Index));
   end Name_Char;

   function Orders_Hash return Unsigned_32 is
      H : Unsigned_32 := 2_166_136_261;
      procedure Add (V : Integer_32) is
         U : Unsigned_32 := Unsigned_32'Mod (V);
      begin
         for B in 1 .. 4 loop
            H := (H xor (U and 255)) * 16_777_619;
            U := Shift_Right (U, 8);
         end loop;
      end Add;
      procedure Add_Line (L : Hood.Population.Line_Rec) is
      begin
         Add (Hood.Population.Line_Kind'Pos (L.Kind));
         Add (L.A);
         Add (L.B);
         Add (L.C);
         Add (L.D);
      end Add_Line;
   begin
      for K in World.People.Orders'Range loop
         declare
            O : Hood.Population.Order_Rec renames World.People.Orders (K);
         begin
            if O.Gang /= 0 then
               Add (K);
               Add (O.Id);
               Add (Hood.Population.Order_Kind'Pos (O.Kind));
               Add (Hood.Population.Order_State'Pos (O.State));
               Add (O.Target_Count);
               for T in 1 .. Integer (O.Target_Count) loop
                  Add (O.Targets (T));
               end loop;
               Add (O.Completed);
               Add (O.Result_Count);
               for R in 1 .. Integer (O.Result_Count) loop
                  Add_Line (O.Results (R));
               end loop;
               Add_Line (O.Fail);
            end if;
         end;
      end loop;
      return H;
   end Orders_Hash;

   function Population_Hash (Which : Integer_32) return Unsigned_32 is
   begin
      if not Started or else World.City.Status /= Hood.City.Status_Ok then
         return 0;
      end if;
      case Which is
         when 1 => return Hood.Population.People_Hash (World.People, World.City);
         when 2 => return Hood.Population.Position_Hash (World.People);
         when 3 => return Hood.Population.Opinion_Hash (World.People);
         when 4 => return Hood.Population.Name_Hash (World.People);
         when 5 => return Orders_Hash;
         when others => return 0;
      end case;
   end Population_Hash;

   function City_Hash return Unsigned_32 is
     (if Started then World.City.City_Hash else 0);

   function Structure_Hash return Unsigned_32 is
     (if Started then World.City.Structure_Hash else 0);

   function City_Count (What : Integer_32) return Integer_32 is
      C : Hood.City.City_State renames World.City;
      N : Integer_32 := 0;
      Used : array (Hood.Tables.Type_Id) of Boolean;
   begin
      if not Started then
         return 0;
      end if;
      case What is
         when Count_Blocks    => return C.Block_Count;
         when Count_Lots      => return C.Lot_Count;
         when Count_Buildings => return Hood.City.Live_Buildings (C);
         when Count_Blocks_X  => return C.W;
         when Count_Blocks_Y  => return C.H;
         when Count_HQ        => return C.HQ_Count;
         when Count_Status    => return C.Status;
         when Count_Retries   => return C.Plan_Retries;
         when Count_Edge      => return C.Industrial_Edge;
         when Count_Rng_Low   => return Integer_32 (C.Rng_After_City and 16#FFFF#);
         when Count_Rng_High  => return Integer_32 (Shift_Right (C.Rng_After_City, 16));
         when Count_People     => return World.People.Count;
         when Count_Next_Id    => return World.People.Next_Id;
         when Count_Week       => return World.People.Week;
         when Count_Minute     => return World.People.Minute;
         when Count_Phase      => return Hood.Population.Phase_Kind'Pos (World.People.Phase);
         when Count_Game_Over  => return B2I (World.People.Game_Over);
         when Count_Pop_Status => return World.People.Status;
         when Count_Draws_Week => return World.People.Draws_This_Week;
         when Count_Setup_Low  => return Integer_32 (World.People.Rng_After_Setup and 16#FFFF#);
         when Count_Setup_High => return Integer_32 (Shift_Right (World.People.Rng_After_Setup, 16));
         when Count_M1_Low     => return Integer_32 (World.People.Rng_After_Minute_1 and 16#FFFF#);
         when Count_M1_High    => return Integer_32 (Shift_Right (World.People.Rng_After_Minute_1, 16));
         when Count_Built_Class .. Count_Built_Class + 7 =>
            return C.Built_Class (Hood.Tables.Building_Class'Val (What - Count_Built_Class));
         when Count_Built_Types => return C.Built_Types;
         when Count_Orders =>
            for O of World.People.Orders loop
               N := N + B2I (O.Gang /= 0);
            end loop;
         when Count_Last        => return World.People.Last_Count;
         when Count_Messages    => return World.People.Message_Count;
         when Count_City_Version => return City_Version;
         when Count_Crews =>
            for R of World.People.Crews loop
               N := N + B2I (R.Gang /= 0);
            end loop;
         when Count_Player_Gang => return Player_Gang;
         when Count_Avenue_Col .. Count_Avenue_Col + 3 => return C.Avenue_Cols (What - Count_Avenue_Col);
         when Count_Avenue_Row .. Count_Avenue_Row + 3 => return C.Avenue_Rows (What - Count_Avenue_Row);
         when Count_Cars => return Cars_N;
         when Count_Fleet => return World.People.Fleet_Count;
         when Count_Trams => return Trams_N;
         when Count_Cars_Halted => return Hood.Population.Traffic.Halted_Count;
         when Count_Kerb =>
            for I in 0 .. World.People.Count - 1 loop
               N := N + B2I (World.People.People (I).Halted and then not World.People.People (I).In_Vehicle);
            end loop;
         when Count_Boardings => return Hood.Population.Transport.Sync_Count;
         when Count_Walking =>
            for I in 0 .. World.People.Count - 1 loop
               N := N + B2I (World.People.People (I).Walking);
            end loop;
         when Count_Role .. Count_Role + 17 =>
            for I in 0 .. World.People.Count - 1 loop
               N := N + B2I (Hood.Tables.Role'Pos (World.People.People (I).Kind) = What - Count_Role);
            end loop;
         when Count_Merged =>
            for I in 0 .. C.Block_Count - 1 loop
               N := N + B2I (C.Blocks (I).Merged_Into /= Hood.City.No_Id);
            end loop;
         when Count_District .. Count_District + 4 =>
            for I in 0 .. C.Block_Count - 1 loop
               N := N + B2I (Hood.Tables.District'Pos (C.Blocks (I).Area) = What - Count_District);
            end loop;
         when Count_Use .. Count_Use + 5 =>
            for I in 0 .. C.Block_Count - 1 loop
               N := N + B2I (Hood.City.Block_Use'Pos (C.Blocks (I).Use_Of) = What - Count_Use);
            end loop;
         when Count_Class .. Count_Class + 7 =>
            for I in 0 .. C.Building_Count - 1 loop
               if not C.Buildings (I).Removed then
                  N := N + B2I (Class_Of (C.Buildings (I).Kind_Of) = What - Count_Class);
               end if;
            end loop;
         when Count_Types_Used =>
            Used := [others => False];
            for I in 0 .. C.Building_Count - 1 loop
               if not C.Buildings (I).Removed then
                  Used (C.Buildings (I).Kind_Of) := True;
               end if;
            end loop;
            for U of Used loop
               N := N + B2I (U);
            end loop;
         when others => null;
      end case;
      return N;
   end City_Count;

   function City_Get (Table, Index, Field : Integer_32) return Integer_32 is
      C : Hood.City.City_State renames World.City;
   begin
      if not Started then
         return 0;
      end if;
      case Table is
         when Table_Block =>
            if Index not in 0 .. C.Block_Count - 1 then
               return 0;
            end if;
            declare
               B : Hood.City.Block_Rec renames C.Blocks (Index);
            begin
               case Field is
                  when F_GX         => return B.GX;
                  when F_GY         => return B.GY;
                  when F_District   => return Hood.Tables.District'Pos (B.Area);
                  when F_Use        => return Hood.City.Block_Use'Pos (B.Use_Of);
                  when F_Span_X     => return B.Span_X;
                  when F_Span_Y     => return B.Span_Y;
                  when F_Merged     => return B.Merged_Into;
                  when F_Land_Value => return B.Land_Value;
                  when F_Squalor    => return B.Squalor;
                  when F_Content    => return B.Content;
                  when F_Rail       => return B2I (B.Rail);
                  when F_Landmark   => return B.Landmark;
                  when F_Name       => return B.Name;
                  when F_Module     => return B.Module;
                  when F_Turn       => return B.Turn;
                  when F_Center_X   => return Integer_32 (B.Center_X);
                  when F_Center_Y   => return Integer_32 (B.Center_Y);
                  when F_First_Lot  => return B.First_Lot;
                  when F_Lots       => return B.Lots;
                  when F_Plan_Value => return B.Plan_Value;
                  when others       => return 0;
               end case;
            end;
         when Table_Lot =>
            if Index not in 0 .. C.Lot_Count - 1 then
               return 0;
            end if;
            declare
               L : Hood.City.Lot_Rec renames C.Lots (Index);
            begin
               case Field is
                  when F_Lot_Block    => return L.Block;
                  when F_Lot_Index    => return L.Index;
                  when F_Lot_X        => return Integer_32 (L.X);
                  when F_Lot_Y        => return Integer_32 (L.Y);
                  when F_Lot_W        => return Integer_32 (L.W);
                  when F_Lot_H        => return Integer_32 (L.H);
                  when F_Lot_Face     => return Hood.Tables.Facing'Pos (L.Face);
                  when F_Lot_Building => return L.Building;
                  when others         => return 0;
               end case;
            end;
         when Table_Building =>
            if Index not in 0 .. C.Building_Count - 1 then
               return 0;
            end if;
            declare
               B : Hood.City.Building_Rec renames C.Buildings (Index);
            begin
               case Field is
                  when F_B_Lot     => return B.Lot;
                  when F_B_Block   => return B.Block;
                  when F_B_Type    => return B.Kind_Of;
                  when F_B_Class   => return Class_Of (B.Kind_Of);
                  when F_B_Storeys => return Hood.Tables.Type_Storeys (B.Kind_Of);
                  when F_B_Trade   => return B.Trade;
                  when F_B_Removed => return B2I (B.Removed);
                  when others      => return 0;
               end case;
            end;
         when Table_Person =>
            if Index not in 0 .. World.People.Count - 1 then
               return 0;
            end if;
            declare
               P : Hood.Population.Person_Rec renames World.People.People (Index);
               G : constant Integer_32 := Integer_32 (P.Gang);
            begin
               case Field is
                  when F_P_Id          => return P.Id;
                  when F_P_Role        => return Hood.Tables.Role'Pos (P.Kind);
                  when F_P_Gang        => return G;
                  when F_P_Female      => return B2I (P.Female);
                  when F_P_Portrait    => return Integer_32 (P.Portrait);
                  when F_P_Pay         => return P.Pay;
                  when F_P_Demand      => return P.Demand;
                  when F_P_Loyalty     => return P.Loyalty;
                  when F_P_Team        => return P.Team;
                  when F_P_Building    => return P.Building;
                  when F_P_X           => return Hood.Floats.Units_Of (P.X);
                  when F_P_Y           => return Hood.Floats.Units_Of (P.Y);
                  when F_P_Walking     => return B2I (P.Walking);
                  when F_P_Status      => return Hood.Population.Status_Kind'Pos (P.Status);
                  when F_P_Hostility   =>
                     return (if G = 0 then -1 else Hood.Population.Hostility_Of (P, G));
                  when F_P_Fear        =>
                     return (if G = 0 then -1 else Hood.Population.Fear_Of (P, G));
                  when F_P_Name_Length => return Hood.Population.Full_Name_Length (P);
                  when F_P_Order       => return P.Order;
                  when F_P_Skill .. F_P_Skill + 10 =>
                     return Integer_32 (P.Skills (Hood.Tables.Skill'Val (Field - F_P_Skill)));
                  when F_P_Opinion + 1 .. F_P_Opinion + 4 =>
                     return Integer_32 (P.Opinion (Field - F_P_Opinion));
                  when others          => return 0;
               end case;
            end;
         when Table_Gang | Table_Crew | Table_Pool =>
            if Index not in Hood.Population.Gang_Id then
               return 0;
            end if;
            declare
               G : Hood.Population.Gang_Rec renames World.People.Gangs (Index);
               First : constant Integer_32 := Hood.Population.Crews.First_Crew (World.People, Index);
               function Crew_Field (F : Integer_32) return Integer_32 is
                 (if First < 0 then (if F = F_G_Crew_Count or else F = F_G_Crew_Pistols
                                         or else F = F_G_Crew_Coupes then 0 else -1)
                  else (case F is
                           when F_G_Team => World.People.Crews (First).Id,
                           when F_G_Lieutenant => World.People.Crews (First).Lieutenant,
                           when F_G_Crew_Count => World.People.Crews (First).Count,
                           when F_G_Crew_Pistols => World.People.Crews (First).Pistols,
                           when others => World.People.Crews (First).Coupes));
            begin
               if Table = Table_Crew then
                  return (if First < 0 then -1
                          elsif Field in 1 .. World.People.Crews (First).Count
                          then World.People.Crews (First).Members (Integer (Field)) else -1);
               elsif Table = Table_Pool then
                  return (if Field in 1 .. G.Pool_Count then G.Pool (Integer (Field)) else -1);
               end if;
               case Field is
                  when F_G_Colour      => return G.Colour;
                  when F_G_Surname     => return G.Surname;
                  when F_G_Player      => return B2I (G.Player);
                  when F_G_Profile     => return G.Profile;
                  when F_G_Boss        => return G.Boss;
                  when F_G_Cash        => return G.Cash;
                  when F_G_Office      => return G.Office;
                  when F_G_Front       => return G.Front;
                  when F_G_Manager     => return G.Manager;
                  when F_G_Team | F_G_Lieutenant | F_G_Crew_Count => return Crew_Field (Field);
                  when F_G_Pool_Count  => return G.Pool_Count;
                  when F_G_Pistols     => return G.Pistols;
                  when F_G_Coupes      => return G.Coupes;
                  when F_G_Speedsters  => return G.Speedsters;
                  when F_G_Trucks      => return G.Trucks;
                  when F_G_Crew_Pistols | F_G_Crew_Coupes => return Crew_Field (Field);
                  when F_G_Crew_Total  => return G.Crew_Total;
                  when F_G_Purchases   => return G.Purchases;
                  when F_G_Protection  => return G.Protection;
                  when F_G_Last_Purchases => return G.Last_Purchases;
                  when F_G_Last_Protection => return G.Last_Protection;
                  when F_G_Committed   =>
                     return Hood.Population.Orders.Committed_Cash (World.People, C, Index, -1);
                  when F_G_Wages       => return G.Wages;
                  when F_G_Eliminated  => return B2I (G.Eliminated);
                  when F_G_Heritage    => return Integer_32 (G.Heritage);
                  when F_G_Offered + 1 .. F_G_Offered + 4 =>
                     return Hood.Population.Stance'Pos (G.Offered (Field - F_G_Offered));
                  when others          => return 0;
               end case;
            end;
         when Table_Premises =>
            if Index not in 0 .. C.Building_Count - 1 then
               return 0;
            end if;
            declare
               E : Hood.Population.Building_Extra renames World.People.Extra (Index);
            begin
               case Field is
                  when F_Pr_Owner_Gang     => return Integer_32 (E.Owner_Gang);
                  when F_Pr_Owner_Person   => return E.Owner_Person;
                  when F_Pr_Manager        => return E.Manager;
                  when F_Pr_Protect_Gang   => return Integer_32 (E.Protect_Gang);
                  when F_Pr_Protect_Weekly => return E.Protect_Weekly;
                  when F_Pr_Front_Of       => return E.Front_Of;
                  when F_Pr_Hides          => return E.Hides;
                  when F_Pr_HQ             => return B2I (E.Is_HQ);
                  when F_Pr_Protect_Base   => return E.Protect_Base;
                  when F_Pr_Collected      => return E.Collected_Week;
                  when others              => return 0;
               end case;
            end;
         when Table_Crews =>
            if Index not in World.People.Crews'Range then
               return 0;
            end if;
            declare
               R : Hood.Population.Crew_Rec renames World.People.Crews (Index);
            begin
               case Field is
                  when F_C_Id          => return R.Id;
                  when F_C_Gang        => return Integer_32 (R.Gang);
                  when F_C_Lieutenant  => return R.Lieutenant;
                  when F_C_Count       => return R.Count;
                  when F_C_Pistols     => return R.Pistols;
                  when F_C_Coupes      => return R.Coupes;
                  when F_C_Speedsters  => return R.Speedsters;
                  when F_C_Trucks      => return R.Trucks;
                  when F_C_Order_Count => return R.Order_Count;
                  when F_C_Time_Used   => return R.Time_Used;
                  when F_C_Name_First  => return R.Name_First;
                  when F_C_Men         =>
                     return (if R.Gang = 0 then 0 else Hood.Population.Orders.Crew_Men (World.People, C, Index));
                  when F_C_Members     =>
                     return (if R.Gang = 0 then 0 else Hood.Population.Orders.Members_Count (World.People, Index));
                  when F_C_Member + 1 .. F_C_Member + Hood.Population.Max_Crew_Members =>
                     return (if Field - F_C_Member <= R.Count then R.Members (Integer (Field - F_C_Member)) else -1);
                  when F_C_Order + 1 .. F_C_Order + Hood.Population.Max_Crew_Orders =>
                     return (if Field - F_C_Order <= R.Order_Count then R.Orders (Integer (Field - F_C_Order))
                             else -1);
                  when others => return 0;
               end case;
            end;
         when Table_Gang_Crews =>
            if Index not in Hood.Population.Gang_Id then
               return 0;
            end if;
            declare
               G : Hood.Population.Gang_Rec renames World.People.Gangs (Index);
            begin
               return (if Field = 0 then G.Crew_Total
                       elsif Field in 1 .. G.Crew_Total then G.Crews (Integer (Field)) else -1);
            end;
         when Table_Order =>
            if Index not in World.People.Orders'Range then
               return 0;
            end if;
            return Order_Field (World.People.Orders (Index), Field, False);
         when Table_Last =>
            if Index not in 0 .. World.People.Last_Count - 1 then
               return 0;
            end if;
            return Order_Field (World.People.Last_Week (Index), Field, False);
         when Table_Preview =>
            if Index /= 0 or else not Have_Preview then
               return 0;
            end if;
            return Order_Field (Preview, Field, True);
         when Table_Message =>
            if Index not in 1 .. World.People.Message_Count then
               return 0;
            end if;
            return Line_Field (World.People.Messages (Integer (Index)), Field);
         when Table_HQ =>
            if Index not in 1 .. C.HQ_Count then
               return 0;
            end if;
            case Field is
               when F_HQ_Block    => return C.HQ (Index).Block;
               when F_HQ_Front    => return C.HQ (Index).Front;
               when F_HQ_Front_As => return C.HQ (Index).Front_As;
               when F_HQ_FX       => return C.HQ (Index).FX;
               when F_HQ_FY       => return C.HQ (Index).FY;
               when others        => return 0;
            end case;
         when others =>
            return 0;
      end case;
   end City_Get;

   procedure Order_Begin (Crew, Kind, Manpower : Integer_32) is
   begin
      Staged := Hood.Population.Orders.No_Input;
      Staged.Crew := Crew;
      Staged.Kind := Hood.Population.Order_Kind'Val
        (Clamp (Kind, 0, Hood.Population.Order_Kind'Pos (Hood.Population.Order_Kind'Last)));
      Staged.Manpower := Manpower;
      Have_Preview := False;
   end Order_Begin;

   procedure Order_Add (What, A, B : Integer_32) is
   begin
      case What is
         when Add_Building =>
            if Staged.Picked_Count < Hood.Population.Max_Targets then
               Staged.Picked_Count := Staged.Picked_Count + 1;
               Staged.Picked (Integer (Staged.Picked_Count)) := A;
            end if;
         when Add_Block =>
            if Staged.Block_Count < Hood.Population.Max_Order_Blocks then
               Staged.Block_Count := Staged.Block_Count + 1;
               Staged.Blocks (Integer (Staged.Block_Count)) := A;
            end if;
         when Add_Point =>
            Staged.PX := Hood.Units.Units (A);
            Staged.PY := Hood.Units.Units (B);
            Staged.Has_Point := True;
         when Add_Amount   => Staged.Amount := A;
         when Add_Level    => Staged.Level := A;
         when Add_Business => Staged.Business := A;
         when Add_Front    => Staged.Front := A;
         when Add_Repeat   => Staged.Repeat := A /= 0;
         when others       => null;
      end case;
   end Order_Add;

   function Staged_Ok return Boolean is
     (Started and then Player_Gang /= 0 and then Staged.Crew in World.People.Crews'Range
      and then Integer_32 (World.People.Crews (Staged.Crew).Gang) = Player_Gang
      and then Staged.Picked_Count >= 0
      and then (for all K in 1 .. Integer (Staged.Picked_Count) =>
                  Staged.Picked (K) in 0 .. World.City.Building_Count - 1)
      and then (for all K in 1 .. Integer (Staged.Block_Count) =>
                  Staged.Blocks (K) in 0 .. World.City.Block_Count - 1)
      and then (Staged.Front = -1 or else Staged.Front in 0 .. World.City.Building_Count - 1));

   function Order_Preview return Integer_32 is
   begin
      Have_Preview := False;
      if not Staged_Ok then
         return 0;
      end if;
      Hood.Population.Orders.Draft
        (World.People, World.City, Player_Gang, Staged, -1, Preview);
      Preview_Time := Hood.Population.Orders.Has_Time (World.People, World.City, Staged.Crew, Preview, -1);
      Preview_Why := Hood.Population.Orders.Staffing_Reason
        (World.People, World.City, Staged.Crew, Staged.Kind, Integer_32'Max (1, Staged.Manpower));
      Have_Preview := True;
      return 1;
   end Order_Preview;

   function Order_Issue return Integer_32 is
      use Hood.Population.Commands;
   begin
      Last_Kept_N := 0;
      Last_Slot := -1;
      if not Started or else Player_Gang = 0 then
         Last_Reply := (Y_No_Crew, 0, 0, 0, 0);
      elsif not Staged_Ok then
         Last_Reply := (if Staged.Crew in World.People.Crews'Range
                          and then Integer_32 (World.People.Crews (Staged.Crew).Gang) = Player_Gang
                        then (Y_No_Site, 0, 0, 0, 0) else (Y_No_Crew, 0, 0, 0, 0));
      else
         Issue (World.People, World.City, Player_Gang, Staged, Last_Reply, Last_Kept, Last_Kept_N, Last_Slot);
      end if;
      Have_Preview := False;
      return Reply_Kind'Pos (Last_Reply.Kind);
   end Order_Issue;

   function Command (Cmd, A, B : Integer_32) return Integer_32 is
      use Hood.Population.Commands;
      G : constant Integer_32 := Player_Gang;
   begin
      Last_Kept_N := 0;
      Last_Slot := -1;
      if G = 0 then
         Last_Reply := (Y_No_Person, 0, 0, 0, 0);
         return Reply_Kind'Pos (Last_Reply.Kind);
      end if;
      case Cmd is
         when Cmd_Cancel       => Cancel (World.People, World.City, G, A, Last_Reply);
         when Cmd_Set_Pay      => Set_Pay (World.People, G, A, B, Last_Reply);
         when Cmd_Sack         => Sack (World.People, G, A, Last_Reply);
         when Cmd_Promote      => Promote (World.People, World.City, G, A, Last_Reply);
         when Cmd_Demote       => Demote (World.People, G, A, Last_Reply);
         when Cmd_Move_To_Crew => Move_To_Crew (World.People, World.City, G, A, B, Last_Reply);
         when Cmd_Move_To_Pool => Move_To_Pool (World.People, World.City, G, A, Last_Reply);
         when Cmd_Buy_Vehicle =>
            if A not in 0 .. 2 then
               Last_Reply := (Y_None, 0, 0, 0, 0);
            else
               Buy_Vehicle (World.People, World.City, G, Hood.Population.Vehicle_Kind'Val (A), B, Last_Reply);
            end if;
         when Cmd_Repeat =>
            if A not in 0 .. World.People.Last_Count - 1 then
               Last_Reply := (Y_No_Order, 0, 0, 0, 0);
            else
               declare
                  O : Hood.Population.Order_Rec renames World.People.Last_Week (A);
               begin
                  Order_Begin (O.Crew, Hood.Population.Order_Kind'Pos (O.Kind), O.Manpower);
                  Staged.Picked_Count := O.Target_Count;
                  Staged.Picked := O.Targets;
                  Staged.Block_Count := O.Block_Count;
                  Staged.Blocks := O.Blocks;
                  Staged.PX := O.PX;
                  Staged.PY := O.PY;
                  Staged.Has_Point := O.Has_Point;
                  Staged.Amount := O.Amount;
                  Staged.Level := O.Level;
                  Staged.Business := O.Business;
                  Staged.Front := O.Front;
                  Staged.Repeat := O.Repeat;
                  return Order_Issue;
               end;
            end if;
         when others => Last_Reply := (Y_None, 0, 0, 0, 0);
      end case;
      Fill_People;
      return Reply_Kind'Pos (Last_Reply.Kind);
   end Command;

   function Reply_Get (Field : Integer_32) return Integer_32 is
   begin
      case Field is
         when 0 => return Hood.Population.Commands.Reply_Kind'Pos (Last_Reply.Kind);
         when 1 => return Last_Reply.A;
         when 2 => return Last_Reply.B;
         when 3 => return Last_Reply.C;
         when 4 => return Last_Reply.D;
         when Reply_Kept_Count => return Last_Kept_N;
         when Reply_Slot => return Last_Slot;
         when Reply_Kept .. Reply_Kept + Hood.Population.Max_Targets - 1 =>
            return (if Field - Reply_Kept < Last_Kept_N then Last_Kept (Integer (Field - Reply_Kept + 1)) else -1);
         when others => return 0;
      end case;
   end Reply_Get;

   function Draw_Ptr (Layer : Integer_32) return Unsigned_32 is
      use System.Storage_Elements;
   begin
      case Layer is
         when Layer_Blocks => return Unsigned_32'Mod (To_Integer (Block_Layer'Address));
         when Layer_Lots   => return Unsigned_32'Mod (To_Integer (Lot_Layer'Address));
         when Layer_People => return Unsigned_32'Mod (To_Integer (People_Layer'Address));
         when Layer_Cars   => return Unsigned_32'Mod (To_Integer (Car_Layer'Address));
         when Layer_Fleet  => return Unsigned_32'Mod (To_Integer (Fleet_Layer'Address));
         when Layer_Trams  => return Unsigned_32'Mod (To_Integer (Tram_Layer'Address));
         when others       => return 0;
      end case;
   end Draw_Ptr;

   function Draw_Len (Layer : Integer_32) return Integer_32 is
     (if not Started then 0
      else (case Layer is
               when Layer_Blocks => World.City.Block_Count * Block_Stride,
               when Layer_Lots   => World.City.Lot_Count * Lot_Stride,
               when Layer_People => World.People.Count * People_Stride,
               when Layer_Cars   => Cars_N * Car_Stride,
               when Layer_Fleet  => World.People.Fleet_Count * Fleet_Stride,
               when Layer_Trams  => Trams_N * Tram_Stride,
               when others       => 0));

   function Rng_Value (Stream, Index : Integer_32) return Unsigned_32 is
      Seed  : constant Unsigned_32 := (if Started then World.City_Seed else 0);
      Main  : Hood.Random.Mulberry := Hood.Random.Seeded (Seed);
      Plan  : Hood.Random.Plan_Lcg := Hood.Random.Plan_Seeded (Seed);
      U     : Unsigned_32 := 0;
      I     : Integer_32 := 0;
      P     : Hood.Random.Plan_Value := 0;
   begin
      if Index not in 1 .. Max_Draws then
         return 0;
      end if;
      for Draw in 1 .. Index loop
         case Stream is
            when Stream_Main => Hood.Random.Next (Main, U);
            when Stream_Int  => Hood.Random.Int (Main, 0, 99, I);
            when Stream_Plan => Hood.Random.Plan_Next (Plan, P);
            when others      => return 0;
         end case;
      end loop;
      case Stream is
         when Stream_Main => return U;
         when Stream_Int  => return Unsigned_32 (I);
         when others      => return Unsigned_32 (P);
      end case;
   end Rng_Value;

   function Grid_W return Integer_32 is
     (if Started then World.Blocks_X * Hood.Grid.Cells_Per_Block else 0);

   function Grid_H return Integer_32 is
     (if Started then World.Blocks_Y * Hood.Grid.Cells_Per_Block else 0);

   function Cell_Kind (X, Y : Integer_32) return Integer_32 is
     (if Started and then X in 0 .. Grid_W - 1 and then Y in 0 .. Grid_H - 1
      then Hood.Grid.Cell_Kind'Pos
             (World.Cells (Hood.Grid.Cell_X (X), Hood.Grid.Cell_Y (Y)).Kind)
      else -1);

   function Check_Value (Id : Integer_32) return Integer_32 is
      use Hood.Units;
   begin
      case Id is
         when 1 => return Integer_32 (Whole (54));
         when 2 => return Integer_32 (Ratio (54, 5));
         when 3 => return Integer_32 (Distance (Whole (3), Whole (4)));
         when 4 => return Integer_32 (Distance (Whole (1), Whole (1)));
         when 5 => return Hood.Trig.Sin (Hood.Trig.Eighth_Turn);
         when 6 => return Hood.Trig.Cos (0);
         when 7 => return Integer_32 (Hood.Trig.Atan2 (Whole (1), Whole (1)));
         when 8 => return Hood.Grid.Cell_Of (Whole (54));
         when 9 => return Hood.Grid.Max_W * Hood.Grid.Max_H;
         when others => return 0;
      end case;
   end Check_Value;

   procedure Crash_Test (Code : Integer_32) is
   begin
      Pending := (if Code in Error_Code then Code else Error_Unexpected_State);
      --  The browser runtime has no exception propagation: this raise goes
      --  straight to the last-chance handler, which is the point of the test.
      pragma Warnings (Off, "pragma Restrictions (No_Exception_Propagation)");
      pragma Warnings (Off, "Last_Chance_Handler will be called");
      raise Program_Error;
      pragma Warnings (On, "Last_Chance_Handler will be called");
      pragma Warnings (On, "pragma Restrictions (No_Exception_Propagation)");
   end Crash_Test;

   function Error_File_Length return Integer_32 is (Integer_32 (File_Last));

   function Error_File_Char (Index : Integer_32) return Integer_32 is
     (if Index in 1 .. Integer_32 (File_Last)
      then Character'Pos (File (Integer (Index)))
      else 0);

   function Pending_Code return Error_Code is (Pending);

   procedure Set_Error_File (Name : String) is
   begin
      File_Last := Integer'Min (Name'Length, Max_File);
      for I in 1 .. File_Last loop
         File (I) := Name (Name'First + I - 1);
      end loop;
   end Set_Error_File;

end Hood.Host_ABI;
