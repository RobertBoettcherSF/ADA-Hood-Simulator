with System.Storage_Elements;
with Hood.City;
with Hood.Grid;
with Hood.Population;
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

   procedure Fill_People is
      S : Hood.Population.Population_State renames World.People;
      K : Integer_32;
   begin
      for I in 0 .. S.Count - 1 loop
         K := I * People_Stride;
         People_Layer (K) := Integer_32 (S.People (I).X);
         People_Layer (K + 1) := Integer_32 (S.People (I).Y);
         People_Layer (K + 2) := Hood.Tables.Role'Pos (S.People (I).Kind);
         People_Layer (K + 3) := Integer_32 (S.People (I).Gang);
         People_Layer (K + 4) :=
           B2I (S.People (I).Building /= Hood.City.No_Id and then not S.People (I).Walking);
      end loop;
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
      end if;
      return Ran;
   end Tick;

   procedure Finish_Week is
   begin
      if Started then
         Hood.World.Finish_Week (World);
         Fill_People;
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
                  when F_P_X           => return Integer_32 (P.X);
                  when F_P_Y           => return Integer_32 (P.Y);
                  when F_P_Walking     => return B2I (P.Walking);
                  when F_P_Status      => return Hood.Population.Status_Kind'Pos (P.Status);
                  when F_P_Hostility   =>
                     return (if G = 0 then -1 else Hood.Population.Hostility_Of (P, G));
                  when F_P_Fear        =>
                     return (if G = 0 then -1 else Hood.Population.Fear_Of (P, G));
                  when F_P_Name_Length => return Hood.Population.Full_Name_Length (P);
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
            begin
               if Table = Table_Crew then
                  return (if Field in 1 .. G.Crew_Count then G.Crew (Integer (Field)) else -1);
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
                  when F_G_Team        => return G.Team;
                  when F_G_Lieutenant  => return G.Lieutenant;
                  when F_G_Crew_Count  => return G.Crew_Count;
                  when F_G_Pool_Count  => return G.Pool_Count;
                  when F_G_Pistols     => return G.Pistols;
                  when F_G_Coupes      => return G.Coupes;
                  when F_G_Crew_Pistols => return G.Crew_Pistols;
                  when F_G_Crew_Coupes => return G.Crew_Coupes;
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
                  when others              => return 0;
               end case;
            end;
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

   function Draw_Ptr (Layer : Integer_32) return Unsigned_32 is
      use System.Storage_Elements;
   begin
      case Layer is
         when Layer_Blocks => return Unsigned_32'Mod (To_Integer (Block_Layer'Address));
         when Layer_Lots   => return Unsigned_32'Mod (To_Integer (Lot_Layer'Address));
         when Layer_People => return Unsigned_32'Mod (To_Integer (People_Layer'Address));
         when others       => return 0;
      end case;
   end Draw_Ptr;

   function Draw_Len (Layer : Integer_32) return Integer_32 is
     (if not Started then 0
      else (case Layer is
               when Layer_Blocks => World.City.Block_Count * Block_Stride,
               when Layer_Lots   => World.City.Lot_Count * Lot_Stride,
               when Layer_People => World.People.Count * People_Stride,
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
