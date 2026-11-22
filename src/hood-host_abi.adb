with System.Storage_Elements;
with Hood.City;
with Hood.Grid;
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

   function B2I (B : Boolean) return Integer_32 is (if B then 1 else 0);

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
   end New_Game;

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
         when others       => return 0;
      end case;
   end Draw_Ptr;

   function Draw_Len (Layer : Integer_32) return Integer_32 is
     (if not Started then 0
      else (case Layer is
               when Layer_Blocks => World.City.Block_Count * Block_Stride,
               when Layer_Lots   => World.City.Lot_Count * Lot_Stride,
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
